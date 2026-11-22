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
use app\models\Medicine;
use app\models\StockMovement;
use Yii;

/**
 * Semua perubahan stok lewat sini (skenario D2).
 * Kuncinya UPDATE bersyarat yang atomik:
 *   UPDATE medicines SET stock = stock + :delta WHERE id = :id AND stock + :delta >= 0 RETURNING stock
 * Dua transaksi yang berebut stok terakhir: yang kedua menunggu baris terkunci, lalu kondisinya
 * gagal (0 baris) sehingga ditolak. CHECK (stock >= 0) di tabel menjadi jaring pengaman terakhir.
 */
final class StockService
{
    /** Wajib dipanggil di dalam transaksi. @return int stok setelah perubahan */
    public function apply(int $medicineId, int $delta, string $type, ?int $prescriptionItemId, ?string $note, ?int $userId): int
    {
        $stockAfter = Yii::$app->db->createCommand(
            'UPDATE medicines SET stock = stock + :delta WHERE id = :id AND stock + :delta >= 0 RETURNING stock',
            [':delta' => $delta, ':id' => $medicineId],
        )->queryScalar();

        if ($stockAfter === false) {
            $medicine = Medicine::findOne($medicineId);
            if ($medicine === null) {
                throw ApiException::notFound('Obat tidak ditemukan');
            }
            throw ApiException::conflict('INSUFFICIENT_STOCK', sprintf(
                'Stok %s tidak mencukupi (tersedia %d %s, dibutuhkan %d)',
                $medicine->name, $medicine->stock, $medicine->unit, abs($delta),
            ), ['medicine_id' => $medicineId, 'available' => (int) $medicine->stock, 'requested' => abs($delta)]);
        }

        (new StockMovement([
            'medicine_id' => $medicineId,
            'movement_type' => $type,
            'quantity' => $delta,
            'stock_after' => (int) $stockAfter,
            'prescription_item_id' => $prescriptionItemId,
            'note' => $note,
            'created_by' => $userId,
        ]))->saveOrFail(false);

        return (int) $stockAfter;
    }

    /** Penerimaan / penyesuaian stok manual oleh farmasi. */
    public function adjust(int $medicineId, array $data, int $userId): Medicine
    {
        $type = (string) ($data['type'] ?? '');
        $qty = filter_var($data['quantity'] ?? null, FILTER_VALIDATE_INT);
        $note = trim((string) ($data['note'] ?? ''));
        $errors = [];
        if (!in_array($type, ['in', 'adjustment'], true)) {
            $errors[] = ['field' => 'type', 'message' => 'Tipe harus in atau adjustment'];
        }
        if ($qty === false || $qty === 0 || ($type === 'in' && $qty < 0)) {
            $errors[] = ['field' => 'quantity', 'message' => $type === 'in' ? 'Jumlah masuk harus > 0' : 'Jumlah tidak boleh 0'];
        }
        if ($type === 'adjustment' && mb_strlen($note) < 5) {
            $errors[] = ['field' => 'note', 'message' => 'Alasan penyesuaian wajib diisi'];
        }
        if ($errors) {
            throw new ApiException(422, 'VALIDATION_ERROR', 'Validasi data gagal', $errors);
        }
        Medicine::findOrFail($medicineId);

        return Tx::run(function () use ($medicineId, $qty, $type, $note, $userId) {
            $this->apply($medicineId, (int) $qty, $type, null, $note ?: null, $userId);
            return Medicine::findOne($medicineId);
        }, 'Mutasi stok: ' . $type);
    }

    /** Stok yang belum "dipesan" resep pending lain. */
    public function available(int $medicineId, ?int $excludePrescriptionId = null): int
    {
        $reserved = (int) (new \yii\db\Query())
            ->from(['i' => 'prescription_items'])
            ->innerJoin(['p' => 'prescriptions'], 'p.id = i.prescription_id')
            ->where(['i.medicine_id' => $medicineId, 'i.voided_at' => null, 'p.status' => 'pending'])
            ->andFilterWhere(['<>', 'p.id', $excludePrescriptionId])
            ->sum('i.quantity');
        return (int) Medicine::find()->select('stock')->where(['id' => $medicineId])->scalar() - $reserved;
    }
}
