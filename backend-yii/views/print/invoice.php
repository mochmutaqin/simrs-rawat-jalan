<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

/**
 * @var array $inv     hasil BillingService::detail()
 * @var array $hospital
 */
use yii\helpers\Html;

$rp = fn ($n) => 'Rp ' . number_format((float) $n, 0, ',', '.');
$labels = ['registration' => 'Pendaftaran', 'procedure' => 'Tindakan Medis', 'lab' => 'Pemeriksaan Penunjang', 'medicine' => 'Obat'];
$statusLabel = ['paid' => 'LUNAS', 'partial' => 'DIBAYAR SEBAGIAN', 'unpaid' => 'BELUM DIBAYAR'];
$groups = [];
foreach ($inv['items'] as $it) {
    $groups[$it['item_type']][] = $it;
}
$v = $inv['visit'];
?>
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice <?= Html::encode($inv['invoice_no']) ?></title>
<?= $this->render('_style') ?>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Cetak / Simpan PDF</button></div>
<div class="page">
  <div class="head">
    <div>
      <h1><?= Html::encode($hospital['name']) ?></h1>
      <div class="addr"><?= Html::encode($hospital['address']) ?></div>
    </div>
    <div class="doc">
      <div class="title">INVOICE</div>
      <div class="no"><?= Html::encode($inv['invoice_no']) ?> · rev. <?= (int) $inv['revision'] ?></div>
      <div style="margin-top:6px"><span class="badge <?= Html::encode($inv['status']) ?>"><?= $statusLabel[$inv['status']] ?? $inv['status'] ?></span></div>
    </div>
  </div>

  <div class="meta">
    <div><span>No. RM</span><?= Html::encode($v['patient']['medical_record_no']) ?></div>
    <div><span>Tanggal kunjungan</span><?= Html::encode($v['visit_date']) ?></div>
    <div><span>Nama pasien</span><?= Html::encode($v['patient']['name']) ?></div>
    <div><span>Poli / Dokter</span><?= Html::encode($v['poli_name'] . ' / ' . $v['doctor_name']) ?></div>
    <div><span>No. antrean</span><?= Html::encode($v['queue_code']) ?></div>
    <div><span>Dicetak</span><?= date('Y-m-d H:i') ?></div>
  </div>

  <table>
    <thead><tr><th>Uraian</th><th class="num">Qty</th><th class="num">Harga</th><th class="num">Subtotal</th></tr></thead>
    <tbody>
    <?php foreach ($labels as $type => $label): if (empty($groups[$type])) continue; ?>
      <tr class="group"><td colspan="4"><?= $label ?></td></tr>
      <?php foreach ($groups[$type] as $it): ?>
        <tr class="<?= $it['voided_at'] ? 'void' : '' ?>">
          <td><?= Html::encode($it['description']) ?><?php if ($it['voided_at']): ?><br><small>Dibatalkan: <?= Html::encode($it['void_reason']) ?></small><?php endif ?></td>
          <td class="num"><?= (int) $it['quantity'] ?></td>
          <td class="num"><?= $rp($it['unit_price']) ?></td>
          <td class="num"><?= $rp($it['subtotal']) ?></td>
        </tr>
      <?php endforeach ?>
    <?php endforeach ?>
    </tbody>
  </table>

  <div class="totals">
    <div><span>Total tagihan</span><b><?= $rp($inv['total_amount']) ?></b></div>
    <div><span>Sudah dibayar</span><span><?= $rp($inv['paid_amount']) ?></span></div>
    <?php if ($inv['overpaid_amount'] > 0): ?>
      <div class="grand"><span>Kelebihan bayar</span><span><?= $rp($inv['overpaid_amount']) ?></span></div>
    <?php else: ?>
      <div class="grand"><span>Sisa tagihan</span><span><?= $rp($inv['balance']) ?></span></div>
    <?php endif ?>
  </div>

  <?php if ($inv['payments']): ?>
  <h3 style="font-size:14px;margin:24px 0 8px">Riwayat pembayaran</h3>
  <table>
    <thead><tr><th>No. bukti</th><th>Waktu</th><th>Jenis</th><th>Metode</th><th class="num">Jumlah</th></tr></thead>
    <tbody>
    <?php foreach ($inv['payments'] as $p): ?>
      <tr>
        <td><?= Html::encode($p['receipt_no']) ?></td>
        <td><?= Html::encode(substr((string) $p['paid_at'], 0, 16)) ?></td>
        <td><?= $p['kind'] === 'refund' ? 'Refund' : 'Pembayaran' ?></td>
        <td><?= $p['method'] === 'cash' ? 'Tunai' : 'Non-tunai (' . Html::encode(strtoupper((string) $p['channel'])) . ')' ?></td>
        <td class="num"><?= ($p['kind'] === 'refund' ? '-' : '') . $rp($p['amount']) ?></td>
      </tr>
    <?php endforeach ?>
    </tbody>
  </table>
  <?php endif ?>

  <div class="foot">
    <div>Dokumen ini dibuat otomatis oleh SIMRS.<br>Pembayaran non-tunai pada sistem ini adalah simulasi.</div>
    <div class="sign"><div class="line">Kasir</div></div>
  </div>
</div>
</body>
</html>
