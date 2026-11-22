<?php

declare(strict_types=1);

namespace app\models;

/**
 * @property int $id
 * @property string $receipt_no
 * @property int $invoice_id
 * @property string $kind payment|refund
 * @property string $amount
 * @property string $method cash|non_cash
 * @property string|null $channel
 * @property string|null $reference_no
 * @property string $idempotency_key
 * @property string $status success|void
 * @property string $paid_at
 * @property int|null $received_by
 * @property-read Invoice $invoice
 */
class Payment extends BaseModel
{
    public static function tableName(): string
    {
        return 'payments';
    }

    protected static function label(): string
    {
        return 'Pembayaran';
    }

    protected static function casts(): array
    {
        return ['invoice_id' => 'int', 'amount' => 'float', 'received_by' => 'int'];
    }

    public function fields(): array
    {
        $f = parent::fields();
        unset($f['idempotency_key']);
        return $f;
    }

    public function getInvoice()
    {
        return $this->hasOne(Invoice::class, ['id' => 'invoice_id']);
    }
}
