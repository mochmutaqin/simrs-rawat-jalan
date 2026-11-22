<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

namespace app\controllers\api;

use app\models\Invoice;
use app\models\Patient;
use app\models\Payment;
use app\services\BillingService;
use app\services\PaymentService;
use Yii;
use yii\web\Response;

/** Billing, pembayaran, refund, invoice & struk cetak. */
class InvoiceController extends BaseController
{
    protected function permissions(): array
    {
        return [
            'index' => ['billing.view'],
            'view' => ['billing.view'],
            'by-visit' => ['billing.view'],
            'pay' => ['payment.create'],
            'refund' => ['payment.create'],
            'patient-payments' => ['billing.view'],
            'print' => ['billing.view'],
            'receipt' => ['billing.view'],
        ];
    }

    public function behaviors(): array
    {
        $behaviors = parent::behaviors();
        // dokumen cetak adalah HTML: jangan dipaksa negosiasi JSON (browser mengirim Accept: text/html)
        $behaviors['contentNegotiator']['except'] = ['print', 'receipt'];
        return $behaviors;
    }

    protected function verbs(): array
    {
        return ['index' => ['GET'], 'view' => ['GET'], 'by-visit' => ['GET'], 'pay' => ['POST'], 'refund' => ['POST'],
            'patient-payments' => ['GET'], 'print' => ['GET'], 'receipt' => ['GET']];
    }

    /** GET /api/invoices?status=&from=&to=&q= */
    public function actionIndex(): array
    {
        $req = Yii::$app->request;
        $query = Invoice::find()->alias('i')->innerJoinWith(['visit v' => fn ($q) => $q->joinWith('patient p')])
            ->andFilterWhere(['i.status' => $req->get('status')])
            ->orderBy(['i.id' => SORT_DESC]);
        if ($from = $this->dateParam('from')) {
            $query->andWhere(['>=', 'v.visit_date', $from]);
        }
        if ($to = $this->dateParam('to')) {
            $query->andWhere(['<=', 'v.visit_date', $to]);
        }
        if (($q = trim((string) $req->get('q', ''))) !== '') {
            $query->andWhere(['or', ['ilike', 'i.invoice_no', $q], ['ilike', 'p.name', $q], ['ilike', 'p.medical_record_no', $q]]);
        }
        [$rows, $meta] = $this->paginate($query);
        return $this->ok(array_map(fn (Invoice $i) => $i->toArray() + [
            'patient_name' => $i->visit->patient->name,
            'medical_record_no' => $i->visit->patient->medical_record_no,
            'visit_date' => $i->visit->visit_date,
        ], $rows), $meta);
    }

    public function actionView(int $id): array
    {
        return $this->ok((new BillingService())->detail(Invoice::findOrFail($id)));
    }

    /** GET /api/visits/{id}/invoice */
    public function actionByVisit(int $id): array
    {
        return $this->ok((new BillingService())->detail(Invoice::forVisitOrFail($id)));
    }

    /**
     * POST /api/invoices/{id}/payments  Header: Idempotency-Key
     * {amount, method: cash|non_cash, channel?: qris|debit|credit|transfer, reference_no?}
     */
    public function actionPay(int $id): array
    {
        $r = (new PaymentService())->pay($id, $this->body(), Yii::$app->request->headers->get('Idempotency-Key'), $this->user());
        return $this->paymentResponse($r);
    }

    /** POST /api/invoices/{id}/refunds  Header: Idempotency-Key  {amount, method, channel?, reason} */
    public function actionRefund(int $id): array
    {
        $r = (new PaymentService())->refund($id, $this->body(), Yii::$app->request->headers->get('Idempotency-Key'), $this->user());
        return $this->paymentResponse($r);
    }

    /** GET /api/patients/{id}/payments : riwayat pembayaran pasien */
    public function actionPatientPayments(int $id): array
    {
        Patient::findActiveOrFail($id);
        $query = (new \yii\db\Query())
            ->select(['pay.id', 'pay.receipt_no', 'pay.kind', 'pay.amount', 'pay.method', 'pay.channel', 'pay.paid_at',
                'i.invoice_no', 'invoice_id' => 'i.id', 'v.visit_date', 'poli' => 'po.name'])
            ->from(['pay' => 'payments'])
            ->innerJoin(['i' => 'invoices'], 'i.id = pay.invoice_id')
            ->innerJoin(['v' => 'visits'], 'v.id = i.visit_id')
            ->innerJoin(['po' => 'polis'], 'po.id = v.poli_id')
            ->where(['v.patient_id' => $id, 'pay.status' => 'success'])
            ->orderBy(['pay.paid_at' => SORT_DESC]);
        [$rows, $meta] = $this->paginate($query);
        foreach ($rows as &$r) {
            $r['amount'] = (float) $r['amount'];
        }
        return $this->ok($rows, $meta);
    }

    /** GET /api/invoices/{id}/print : invoice HTML siap cetak */
    public function actionPrint(int $id): string
    {
        $data = (new BillingService())->detail(Invoice::findOrFail($id));
        return $this->renderPrint('invoice', ['inv' => $data]);
    }

    /** GET /api/payments/{id}/receipt : bukti pembayaran HTML siap cetak */
    public function actionReceipt(int $id): string
    {
        $payment = Payment::findOrFail($id);
        $data = (new BillingService())->detail($payment->invoice);
        return $this->renderPrint('receipt', ['inv' => $data, 'payment' => $payment->toArray()]);
    }

    private function paymentResponse(array $r): array
    {
        $payment = $r['payment'];
        $invoice = Invoice::findOne($payment->invoice_id);
        return $this->ok(['payment' => $payment, 'invoice' => $invoice], ['replayed' => $r['replayed']], $r['replayed'] ? 200 : 201);
    }

    private function renderPrint(string $view, array $params): string
    {
        Yii::$app->response->format = Response::FORMAT_HTML;
        $params['hospital'] = ['name' => Yii::$app->params['hospital.name'], 'address' => Yii::$app->params['hospital.address']];
        return $this->renderPartial('@app/views/print/' . $view, $params);
    }
}
