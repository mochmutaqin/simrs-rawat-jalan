<?php
/**
 * @var array $inv
 * @var array $payment
 * @var array $hospital
 */
use yii\helpers\Html;

$rp = fn ($n) => 'Rp ' . number_format((float) $n, 0, ',', '.');
$v = $inv['visit'];
$isRefund = $payment['kind'] === 'refund';
?>
<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= $isRefund ? 'Bukti Refund' : 'Bukti Pembayaran' ?> <?= Html::encode($payment['receipt_no']) ?></title>
<?= $this->render('_style') ?>
<style>.page{max-width:420px} .toolbar{max-width:420px} .meta{grid-template-columns:1fr}</style>
</head>
<body>
<div class="toolbar"><button onclick="window.print()">Cetak</button></div>
<div class="page">
  <div class="head" style="display:block;text-align:center">
    <h1><?= Html::encode($hospital['name']) ?></h1>
    <div class="addr"><?= Html::encode($hospital['address']) ?></div>
  </div>
  <div style="text-align:center;margin:14px 0">
    <div class="title" style="font-weight:700;font-size:16px;letter-spacing:.06em"><?= $isRefund ? 'BUKTI REFUND' : 'BUKTI PEMBAYARAN' ?></div>
    <div class="no" style="font-family:Consolas,monospace;color:#5b6470"><?= Html::encode($payment['receipt_no']) ?></div>
  </div>
  <div class="meta">
    <div><span>Waktu</span><?= Html::encode(substr((string) $payment['paid_at'], 0, 19)) ?></div>
    <div><span>No. invoice</span><?= Html::encode($inv['invoice_no']) ?></div>
    <div><span>Pasien</span><?= Html::encode($v['patient']['name'] . ' (' . $v['patient']['medical_record_no'] . ')') ?></div>
    <div><span>Poli</span><?= Html::encode($v['poli_name']) ?></div>
    <div><span>Metode</span><?= $payment['method'] === 'cash' ? 'Tunai' : 'Non-tunai · ' . Html::encode(strtoupper((string) $payment['channel'])) ?></div>
    <?php if ($payment['reference_no']): ?><div><span>Ref.</span><?= Html::encode($payment['reference_no']) ?></div><?php endif ?>
  </div>
  <div class="totals" style="width:100%">
    <div class="grand"><span><?= $isRefund ? 'Jumlah dikembalikan' : 'Jumlah dibayar' ?></span><span><?= $rp($payment['amount']) ?></span></div>
    <div><span>Total tagihan</span><span><?= $rp($inv['total_amount']) ?></span></div>
    <div><span>Total terbayar</span><span><?= $rp($inv['paid_amount']) ?></span></div>
    <div><span>Sisa tagihan</span><span><?= $rp($inv['balance']) ?></span></div>
    <div><span>Status</span><span class="badge <?= Html::encode($inv['status']) ?>"><?= ['paid' => 'LUNAS', 'partial' => 'SEBAGIAN', 'unpaid' => 'BELUM DIBAYAR'][$inv['status']] ?></span></div>
  </div>
  <div class="foot" style="justify-content:center;text-align:center"><div>Terima kasih. Simpan bukti ini.<br>Non-tunai = simulasi.</div></div>
</div>
</body>
</html>
