<?php

declare(strict_types=1);

namespace app\models;

/**
 * total_amount, paid_amount, dan status DIHITUNG OLEH DATABASE (trigger fn_recalc_invoice),
 * aplikasi tidak pernah menulis kolom-kolom tersebut.
 *
 * @property int $id
 * @property string $invoice_no
 * @property int $visit_id
 * @property string $status unpaid|partial|paid
 * @property string $total_amount
 * @property string $paid_amount
 * @property int $revision
 * @property int|null $created_by
 * @property string $created_at
 * @property-read Visit $visit
 * @property-read InvoiceItem[] $items
 * @property-read Payment[] $payments
 */
class Invoice extends BaseModel
{
    public static function tableName(): string
    {
        return 'invoices';
    }

    protected static function label(): string
    {
        return 'Tagihan';
    }

    protected static function casts(): array
    {
        return ['visit_id' => 'int', 'total_amount' => 'float', 'paid_amount' => 'float', 'revision' => 'int', 'created_by' => 'int'];
    }

    public function balance(): float
    {
        return round((float) $this->total_amount - (float) $this->paid_amount, 2);
    }

    public function fields(): array
    {
        return parent::fields() + [
            'balance' => fn () => $this->balance() > 0 ? $this->balance() : 0.0,
            'overpaid_amount' => fn () => $this->balance() < 0 ? -$this->balance() : 0.0,
        ];
    }

    public function extraFields(): array
    {
        return ['items', 'payments', 'visit'];
    }

    public function getVisit()
    {
        return $this->hasOne(Visit::class, ['id' => 'visit_id']);
    }

    public function getItems()
    {
        return $this->hasMany(InvoiceItem::class, ['invoice_id' => 'id'])->orderBy('id');
    }

    public function getPayments()
    {
        return $this->hasMany(Payment::class, ['invoice_id' => 'id'])->orderBy('id');
    }

    public static function forVisitOrFail(int $visitId): self
    {
        $inv = self::findOne(['visit_id' => $visitId]);
        if ($inv === null) {
            throw \app\components\ApiException::notFound('Tagihan untuk kunjungan ini belum ada');
        }
        return $inv;
    }
}
