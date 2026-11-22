@echo off
REM Author: Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
REM Hapus file bawaan template yii2-app-basic yang tidak dipakai backend API SIMRS.
REM Jalankan SEKALI dari folder backend-yii:  cleanup-template.bat
cd /d "%~dp0"
del /q controllers\SiteController.php models\ContactForm.php models\LoginForm.php commands\HelloController.php 2>nul
del /q assets\AppAsset.php docker-compose.yml Vagrantfile vendor.zip 2>nul
del /q tests\Acceptance.suite.yml tests\Functional.suite.yml tests\Unit\LoginTest.php tests\Unit\LogoutTest.php 2>nul
del /q tests\Support\MailerBootstrap.php 2>nul
rmdir /s /q views\site views\layouts widgets mail vagrant assets tests\Acceptance tests\Functional tests\Unit\Models tests\Unit\widgets 2>nul
echo Selesai. File template yang tidak dipakai sudah dihapus.
