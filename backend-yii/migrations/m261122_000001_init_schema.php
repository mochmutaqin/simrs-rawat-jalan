<?php

/**
 * SIMRS Rawat Jalan
 *
 * @author  Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
 * @link    https://github.com/mochmutaqin/simrs-rawat-jalan
 */

declare(strict_types=1);

use yii\db\Migration;

/**
 * Pasang skema dari database/001_schema.sql (satu sumber kebenaran untuk Yii,
 * docker-compose, dan instalasi manual lewat psql).
 * Bila skema sudah terpasang (mis. lewat docker-compose), migration ini dilewati.
 */
class m261122_000001_init_schema extends Migration
{
    public function safeUp()
    {
        if ($this->db->getTableSchema('roles', true) !== null) {
            echo "    > skema sudah terpasang, dilewati\n";
            return true;
        }
        $file = dirname(__DIR__, 2) . '/database/001_schema.sql';
        if (!is_file($file)) {
            throw new RuntimeException("File skema tidak ditemukan: $file");
        }
        $sql = (string) file_get_contents($file);
        // BEGIN/COMMIT di file dibuang: migration ini sudah berjalan dalam transaksi.
        $sql = preg_replace('/^\s*(BEGIN|COMMIT)\s*;\s*$/mi', '', $sql);
        $this->db->pdo->exec($sql);
        // cek "roles belum ada" di atas ikut tersimpan di schema cache (aktif di produksi): buang agar tidak basi
        $this->db->getSchema()->refresh();
        return true;
    }

    public function safeDown()
    {
        echo "    > migration skema awal tidak bisa di-rollback (hapus database secara manual)\n";
        return false;
    }
}
