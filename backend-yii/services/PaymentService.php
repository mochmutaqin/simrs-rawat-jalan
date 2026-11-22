<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\services;

use app\components\ApiException;
use app\components\Tx;
use app\models\Invoice;
use app\models\Payment;
use app\models\User;
use app\models\Visit;
use yii\db\IntegrityException;

/**
 * Pembayaran bertahap, tunai/non-tunai (simulasi), dan refund. Skenario D3:
 * klien WAJIB mengirim Idempotency-Key (dibuat sekali saat form bayar dibuka). Bila jaringan
 * putus lalu kasir menekan "Bayar" lagi, kunci yang sama dikirim ulang:
 *  - kunci sudah ada  -> pembayaran lama dikembalikan (replayed: true), tidak dicatat ulang;
 *  - dua request bersamaan -> unique index payments.idempotency_key membuat yang kedua gagal,
 *    lalu ditangkap dan dijawab dengan pembayaran yang sudah tercatat.
 * Trigger tg_payment_guard mengunci invoice dan menolak bayar melebihi sisa tagihan.
 */
final class PaymentService
{
    private const CHANNELS = ['qris', 'debit', 'credit', 'transfer'];

    public function __construct(private readonly OutboxService $outbox = new OutboxService())
    {
    }

    /** @return array{payment: Payment, replayed: bool} */
    public function pay(int $invoiceId, array $data, ?string $key, User $user): array
    {
        return $this->record('payment', $invoiceId, $data, $key, $user);
    }

    /** @return array{payment: Payment, replayed: bool} */
    public function refund(int $invoiceId, array $data, ?string $key, User $user): array
    {
        BillingService::requireReason($data['reason'] ?? null);
        return $this->record('refund', $invoiceId, $data, $key, $user);
    }

    /** @return array{payment: Payment, replayed: bool} */
    private function record(string $kind, int $invoiceId, array $data, ?string $key, User $user): array
    {
        $key = trim((string) $key);
        if (!preg_match('/^[A-Za-z0-9_\-:.]{8,100}$/', $key)) {
            throw ApiException::badRequest('Header Idempotency-Key wajib diisi (8-100 karakter)');
        }
        [$amount, $method, $channel, $reference] = $this->validate($data);

        $replay = $this->findReplay($key, $invoiceId, $kind, $amount);
        if ($replay !== null) {
            return ['payment' => $replay, 'replayed' => true];
        }

        try {
            $payment = Tx::run(function () use ($kind, $invoiceId, $amount, $method, $channel, $reference, $key, $user) {
                $invoice = Invoice::findBySql('SELECT * FROM invoices WHERE id = :id FOR UPDATE', [':id' => $invoiceId])->one();
                if ($invoice === null) {
                    throw ApiException::notFound('Tagihan tidak ditemukan');
                }
                $balance = $invoice->balance();
                if ($kind === 'payment' && $amount > $balance) {
                    throw ApiException::unprocessable('PAYMENT_EXCEEDS_BALANCE',
                        sprintf('Jumlah bayar melebihi sisa tagihan (sisa Rp %s)', number_format(max($balance, 0), 0, ',', '.')),
                        ['balance' => max($balance, 0)]);
                }
                if ($kind === 'refund' && $amount > -$balance) {
                    throw ApiException::unprocessable('REFUND_EXCEEDS_OVERPAID',
                        sprintf('Refund melebihi kelebihan bayar (Rp %s)', number_format(max(-$balance, 0), 0, ',', '.')),
                        ['overpaid_amount' => max(-$balance, 0)]);
                }

                $payment = new Payment([
                    'invoice_id' => $invoice->id,
                    'kind' => $kind,
                    'amount' => $amount,
                    'method' => $method,
                    'channel' => $channel,
                    'reference_no' => $reference ?? ($method === 'non_cash' ? 'SIM-' . strtoupper(bin2hex(random_bytes(5))) : null),
                    'idempotency_key' => $key,
                    'received_by' => $user->id,
                ]);
                $payment->saveOrFail(false);
                $invoice->refresh();

                if ($kind === 'payment' && $invoice->status === 'paid') {
                    $visit = Visit::findOne($invoice->visit_id);
                    if ($visit !== null && $visit->status === 'exam_done') {
                        $visit->status = 'completed';
                        $visit->saveOrFail(false);
                    }
                    $this->outbox->record('payment.completed', 'invoice', (int) $invoice->id, [
                        'invoice_id' => (int) $invoice->id,
                        'invoice_no' => $invoice->invoice_no,
                        'visit_id' => (int) $invoice->visit_id,
                        'total_amount' => (float) $invoice->total_amount,
                    ]);
                }
                $payment->refresh();
                return $payment;
            }, $kind === 'refund' ? 'Refund: ' . trim((string) $data['reason']) : 'Pembayaran');
        } catch (IntegrityException $e) {
            // request kembar yang datang bersamaan: yang kalah balapan menerima hasil yang menang
            if (str_contains($e->getMessage(), 'payments_idempotency_key_key')) {
                $replay = $this->findReplay($key, $invoiceId, $kind, $amount);
                if ($replay !== null) {
                    return ['payment' => $replay, 'replayed' => true];
                }
            }
            throw $e;
        }
        return ['payment' => $payment, 'replayed' => false];
    }

    private function findReplay(string $key, int $invoiceId, string $kind, float $amount): ?Payment
    {
        $existing = Payment::findOne(['idempotency_key' => $key]);
        if ($existing === null) {
            return null;
        }
        if ((int) $existing->invoice_id !== $invoiceId || $existing->kind !== $kind || abs((float) $existing->amount - $amount) > 0.001) {
            throw ApiException::unprocessable('IDEMPOTENCY_KEY_REUSED', 'Idempotency-Key sudah dipakai untuk transaksi lain');
        }
        return $existing;
    }

    /** @return array{0: float, 1: string, 2: ?string, 3: ?string} */
    private function validate(array $data): array
    {
        $errors = [];
        $amount = filter_var($data['amount'] ?? null, FILTER_VALIDATE_FLOAT);
        if ($amount === false || $amount <= 0 || round($amount, 2) != $amount) {
            $errors[] = ['field' => 'amount', 'message' => 'Jumlah harus angka > 0 (maks. 2 desimal)'];
        }
        $method = (string) ($data['method'] ?? '');
        if (!in_array($method, ['cash', 'non_cash'], true)) {
            $errors[] = ['field' => 'method', 'message' => 'Metode harus cash atau non_cash'];
        }
        $channel = isset($data['channel']) && $data['channel'] !== '' ? (string) $data['channel'] : null;
        if ($method === 'non_cash' && !in_array($channel, self::CHANNELS, true)) {
            $errors[] = ['field' => 'channel', 'message' => 'Channel non-tunai: ' . implode(', ', self::CHANNELS)];
        }
        if ($method === 'cash') {
            $channel = null;
        }
        $reference = isset($data['reference_no']) && $data['reference_no'] !== '' ? mb_substr((string) $data['reference_no'], 0, 100) : null;
        if ($errors) {
            throw new ApiException(422, 'VALIDATION_ERROR', 'Validasi pembayaran gagal', $errors);
        }
        return [(float) $amount, $method, $channel, $reference];
    }
}
