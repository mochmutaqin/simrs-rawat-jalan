<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

/**
 * Tabel route REST. Satu tempat untuk melihat seluruh endpoint Yii.
 */
$rules = [
    // auth
    'POST api/auth/login' => 'api/auth/login',
    'GET api/auth/me' => 'api/auth/me',
    'POST api/auth/change-password' => 'api/auth/change-password',

    // extra master
    'GET api/users/roles' => 'api/user/roles',
    'GET api/doctor-schedules/available' => 'api/doctor-schedule/available',
    'POST api/medicines/<id:\d+>/stock' => 'api/medicine/stock',
    'GET api/medicines/<id:\d+>/movements' => 'api/medicine/movements',

    // pendaftaran & antrean
    'GET api/visits' => 'api/visit/index',
    'POST api/visits' => 'api/visit/create',
    'GET api/visits/<id:\d+>' => 'api/visit/view',
    'POST api/visits/<id:\d+>/cancel' => 'api/visit/cancel',
    'POST api/visits/<id:\d+>/call' => 'api/visit/call',
    'GET api/patients/<id:\d+>/visits' => 'api/visit/patient-history',

    // pemeriksaan & rekam medis
    'GET api/examinations/queue' => 'api/examination/queue',
    'GET api/visits/<id:\d+>/examination' => 'api/examination/view',
    'PUT api/visits/<id:\d+>/examination' => 'api/examination/save',
    'POST api/visits/<id:\d+>/examination/finalize' => 'api/examination/finalize',
    'GET api/visits/<id:\d+>/examination/history' => 'api/examination/history',
    'GET api/patients/<id:\d+>/medical-records' => 'api/examination/medical-record',

    // tindakan
    'GET api/visits/<id:\d+>/procedures' => 'api/visit-procedure/index',
    'POST api/visits/<id:\d+>/procedures' => 'api/visit-procedure/create',
    'DELETE api/visits/<id:\d+>/procedures/<pid:\d+>' => 'api/visit-procedure/delete',

    // resep & farmasi
    'GET api/prescriptions' => 'api/prescription/index',
    'GET api/prescriptions/<id:\d+>' => 'api/prescription/view',
    'POST api/prescriptions/<id:\d+>/cancel' => 'api/prescription/cancel',
    'POST api/prescriptions/<id:\d+>/dispense' => 'api/prescription/dispense',
    'GET api/visits/<id:\d+>/prescriptions' => 'api/prescription/by-visit',
    'POST api/visits/<id:\d+>/prescriptions' => 'api/prescription/create',
    'GET api/patients/<id:\d+>/medications' => 'api/prescription/patient-medications',

    // laboratorium (permintaan; worklist & input hasil ada di services-node)
    'GET api/visits/<id:\d+>/lab-requests' => 'api/lab/by-visit',
    'POST api/visits/<id:\d+>/lab-requests' => 'api/lab/create',
    'POST api/lab-requests/<id:\d+>/cancel' => 'api/lab/cancel',

    // billing & pembayaran
    'GET api/invoices' => 'api/invoice/index',
    'GET api/invoices/<id:\d+>' => 'api/invoice/view',
    'GET api/invoices/<id:\d+>/print' => 'api/invoice/print',
    'POST api/invoices/<id:\d+>/payments' => 'api/invoice/pay',
    'POST api/invoices/<id:\d+>/refunds' => 'api/invoice/refund',
    'GET api/visits/<id:\d+>/invoice' => 'api/invoice/by-visit',
    'GET api/payments/<id:\d+>/receipt' => 'api/invoice/receipt',
    'GET api/patients/<id:\d+>/payments' => 'api/invoice/patient-payments',

    // antar-service (services-node)
    'PUT internal/lab-items/<id:\d+>/result' => 'api/internal/lab-result',

    'GET api/health' => 'api/health/index',
];

// CRUD master data: path => controller
$crud = [
    'polis' => 'poli',
    'medical-staff' => 'medical-staff',
    'doctor-schedules' => 'doctor-schedule',
    'patients' => 'patient',
    'procedures' => 'procedure',
    'medicines' => 'medicine',
    'lab-tests' => 'lab-test',
    'users' => 'user',
];
foreach ($crud as $path => $ctrl) {
    $rules["GET api/$path"] = "api/$ctrl/index";
    $rules["POST api/$path"] = "api/$ctrl/create";
    $rules["GET api/$path/<id:\\d+>"] = "api/$ctrl/view";
    $rules["PUT,PATCH api/$path/<id:\\d+>"] = "api/$ctrl/update";
    $rules["DELETE api/$path/<id:\\d+>"] = "api/$ctrl/delete";
}

// Preflight CORS untuk semua path API
$rules['OPTIONS <path:(api|internal)/.*>'] = 'api/health/options';

return $rules;
