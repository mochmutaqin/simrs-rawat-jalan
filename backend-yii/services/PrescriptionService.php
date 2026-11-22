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
use app\models\Prescription;
use app\models\PrescriptionItem;
use app\models\User;
use app\models\Visit;

/** Resep (dokter) dan penyerahan obat (farmasi). */
final class PrescriptionService
{
    public function __construct(
        private readonly StockService $stock = new StockService(),
        private readonly BillingService $billing = new BillingService(),
    ) {
    }

    public function create(int $visitId, array $data, User $user): Prescription
    {
        $rows = $data['items'] ?? null;
        if (!is_array($rows) || $rows === []) {
            throw new ApiException(422, 'VALIDATION_ERROR', 'Validasi data gagal', [['field' => 'items', 'message' => 'Minimal satu obat']]);
        }

        return Tx::run(function () use ($visitId, $rows, $data, $user) {
            $visit = Visit::lockOrFail($visitId);
            $visit->assertActive();
            AccessGuard::assertCanTreat($visit, $user);

            $items = [];
            $errors = [];
            $seen = [];
            foreach (array_values($rows) as $i => $row) {
                $item = new PrescriptionItem();
                $item->setAttributes(is_array($row) ? $row : [], false);
                if (!$item->validate(['medicine_id', 'dose', 'frequency', 'quantity', 'instructions'])) {
                    foreach ($item->getErrors() as $f => $m) {
                        $errors[] = ['field' => "items.$i.$f", 'message' => $m[0]];
                    }
                    continue;
                }
                $medicine = Medicine::findOne(['id' => $item->medicine_id, 'is_active' => true]);
                if ($medicine === null) {
                    $errors[] = ['field' => "items.$i.medicine_id", 'message' => 'Obat tidak ditemukan atau nonaktif'];
                    continue;
                }
                if (isset($seen[$medicine->id])) {
                    $errors[] = ['field' => "items.$i.medicine_id", 'message' => 'Obat yang sama ditulis dua kali'];
                    continue;
                }
                $seen[$medicine->id] = true;
                $available = $this->stock->available((int) $medicine->id);
                if ((int) $item->quantity > $available) {
                    $errors[] = ['field' => "items.$i.quantity", 'message' => sprintf(
                        'Stok %s tidak cukup (tersedia %d %s)', $medicine->name, max($available, 0), $medicine->unit)];
                    continue;
                }
                $item->unit_price = $medicine->price;   // snapshot harga
                $items[] = $item;
            }
            if ($errors) {
                throw new ApiException(422, 'VALIDATION_ERROR', 'Validasi resep gagal', $errors);
            }

            $prescription = new Prescription([
                'visit_id' => $visit->id,
                'doctor_id' => AccessGuard::actingDoctorId($visit, $user),
                'status' => 'pending',
                'notes' => isset($data['notes']) ? mb_substr(trim((string) $data['notes']), 0, 500) : null,
            ]);
            $prescription->saveOrFail(false);
            foreach ($items as $item) {
                $item->prescription_id = $prescription->id;
                $item->saveOrFail(false);
            }
            return $prescription;
        }, 'Buat resep');
    }

    public function cancel(int $id, ?string $reason, User $user): Prescription
    {
        $reason = BillingService::requireReason($reason);
        return Tx::run(function () use ($id, $reason) {
            $p = Prescription::lockOrFail($id);
            if ($p->status !== 'pending') {
                throw ApiException::conflict('INVALID_STATUS', 'Hanya resep yang belum diserahkan yang bisa dibatalkan');
            }
            $p->status = 'cancelled';
            $p->notes = trim(($p->notes ? $p->notes . "\n" : '') . 'Batal: ' . $reason);
            $p->saveOrFail(false);
            return $p;
        }, 'Batal resep: ' . $reason);
    }

    /**
     * Serahkan obat: semua item atau tidak sama sekali.
     * - baris resep dikunci (FOR UPDATE) -> dua petugas tidak bisa menyerahkan resep yang sama;
     * - stok dikurangi atomik per obat, urut medicine_id agar urutan kunci konsisten (cegah deadlock);
     * - unique index ux_stock_dispense_once mencegah item resep keluar dua kali.
     */
    public function dispense(int $id, User $user): Prescription
    {
        return Tx::run(function () use ($id, $user) {
            $p = Prescription::lockOrFail($id);
            if ($p->status === 'dispensed') {
                throw ApiException::conflict('ALREADY_DISPENSED', 'Resep sudah diserahkan');
            }
            if ($p->status === 'cancelled') {
                throw ApiException::conflict('PRESCRIPTION_CANCELLED', 'Resep sudah dibatalkan');
            }
            $p->visit->assertActive();

            $items = $p->items;
            usort($items, fn ($a, $b) => $a->medicine_id <=> $b->medicine_id);
            foreach ($items as $item) {
                $this->stock->apply((int) $item->medicine_id, -(int) $item->quantity, 'dispense', (int) $item->id,
                    'Resep #' . $p->id, (int) $user->id);
                $this->billing->addItem((int) $p->visit_id, 'medicine', (int) $item->id,
                    $item->medicine->name . ' (' . $item->dose . ', ' . $item->frequency . ')',
                    (int) $item->quantity, (float) $item->unit_price);
            }
            $p->status = 'dispensed';
            $p->dispensed_by = $user->id;
            $p->dispensed_at = new \yii\db\Expression('now()');
            $p->saveOrFail(false);
            $p->refresh();
            return $p;
        }, 'Serahkan obat');
    }
}
