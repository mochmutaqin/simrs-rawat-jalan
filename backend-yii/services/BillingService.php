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
use app\models\Invoice;
use app\models\InvoiceItem;
use app\models\Visit;
use Yii;

/**
 * Satu kunjungan = satu invoice yang tumbuh seiring pelayanan.
 * Setiap tindakan/lab/obat langsung menjadi baris invoice_items; total & status
 * dihitung ulang oleh trigger database, jadi tidak ada angka yang bisa "lupa diupdate".
 * Perubahan setelah ditagih = void baris lama (+ alasan) dan revisi naik (skenario D4).
 */
final class BillingService
{
    public function createForVisit(Visit $visit, int $userId): Invoice
    {
        $invoice = new Invoice(['visit_id' => $visit->id, 'created_by' => $userId]);
        $invoice->saveOrFail(false);
        $this->addItem($visit->id, 'registration', $visit->id, 'Biaya pendaftaran ' . $visit->poli->name, 1, (float) $visit->registration_fee);
        return $invoice;
    }

    public function addItem(int $visitId, string $type, int $sourceId, string $description, int $qty, float $unitPrice): InvoiceItem
    {
        $invoice = Invoice::forVisitOrFail($visitId);
        $item = new InvoiceItem([
            'invoice_id' => $invoice->id,
            'item_type' => $type,
            'source_id' => $sourceId,
            'description' => $description,
            'quantity' => $qty,
            'unit_price' => $unitPrice,
        ]);
        $item->saveOrFail(false);

        // Tambahan setelah ada pembayaran = tagihan direvisi.
        if ((float) $invoice->paid_amount > 0) {
            $this->bumpRevision($invoice->id);
        }
        return $item;
    }

    public function voidItem(int $visitId, string $type, int $sourceId, string $reason): void
    {
        $invoice = Invoice::forVisitOrFail($visitId);
        $affected = InvoiceItem::updateAll(
            ['voided_at' => new \yii\db\Expression('now()'), 'void_reason' => $reason],
            ['invoice_id' => $invoice->id, 'item_type' => $type, 'source_id' => $sourceId, 'voided_at' => null],
        );
        if ($affected > 0) {
            $this->bumpRevision($invoice->id);
        }
    }

    public function voidAll(int $visitId, string $reason): void
    {
        $invoice = Invoice::forVisitOrFail($visitId);
        InvoiceItem::updateAll(
            ['voided_at' => new \yii\db\Expression('now()'), 'void_reason' => $reason],
            ['invoice_id' => $invoice->id, 'voided_at' => null],
        );
        $this->bumpRevision($invoice->id);
    }

    /** @return array invoice lengkap dengan rincian & riwayat pembayaran */
    public function detail(Invoice $invoice): array
    {
        $invoice->refresh();
        $visit = $invoice->visit;
        $items = array_map(fn (InvoiceItem $i) => $i->toArray(), $invoice->items);

        $summary = [];
        foreach ($invoice->items as $i) {
            if ($i->voided_at === null) {
                $summary[$i->item_type] = ($summary[$i->item_type] ?? 0) + (float) $i->subtotal;
            }
        }

        return $invoice->toArray() + [
            'visit' => $visit->toArray(),
            'summary' => [
                'registration' => $summary['registration'] ?? 0.0,
                'procedure' => $summary['procedure'] ?? 0.0,
                'lab' => $summary['lab'] ?? 0.0,
                'medicine' => $summary['medicine'] ?? 0.0,
            ],
            'items' => $items,
            'payments' => array_map(fn ($p) => $p->toArray(), $invoice->payments),
        ];
    }

    private function bumpRevision(int $invoiceId): void
    {
        Yii::$app->db->createCommand('UPDATE invoices SET revision = revision + 1 WHERE id = :id', [':id' => $invoiceId])->execute();
    }

    public static function requireReason(?string $reason): string
    {
        $reason = trim((string) $reason);
        if (mb_strlen($reason) < 5) {
            throw ApiException::unprocessable('REASON_REQUIRED', 'Alasan perubahan wajib diisi (minimal 5 karakter)');
        }
        return $reason;
    }
}
