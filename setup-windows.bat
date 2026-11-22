@echo off
setlocal EnableExtensions
REM ==================================================================
REM  Setup SIMRS di Windows tanpa Docker.
REM  Memakai PostgreSQL 17 di: C:\Program Files\PostgreSQL\17\bin
REM  Aman dijalankan ulang: database, migrasi, seed, dan user read-only
REM  hanya dibuat bila belum ada.
REM ==================================================================

set "PG_BIN=C:\Program Files\PostgreSQL\17\bin"
set "PGHOST=localhost"
set "PGPORT=5432"
set "PGUSER=postgres"
set "DB_NAME=simrs"
set "ROOT=%~dp0"
set "PATH=%PG_BIN%;%PATH%"

echo.
echo === [1/7] Cek prasyarat ===
if exist "%PG_BIN%\psql.exe" goto :pgok
echo [GAGAL] psql.exe tidak ditemukan di "%PG_BIN%".
echo         Pastikan PostgreSQL 17 sudah terinstall, atau ubah PG_BIN di bagian atas file ini.
goto :fail
:pgok
echo PostgreSQL : %PG_BIN%

where php >nul 2>&1
if not errorlevel 1 goto :phpok
echo [GAGAL] php tidak ditemukan di PATH.
goto :fail
:phpok
php -m | findstr /i "pdo_pgsql" >nul
if not errorlevel 1 goto :pdook
echo [GAGAL] Ekstensi pdo_pgsql di PHP belum aktif.
echo         Buka php.ini berikut, hapus tanda ; di depan extension=pdo_pgsql dan extension=pgsql, lalu jalankan ulang:
php --ini | findstr /i "Loaded"
goto :fail
:pdook
echo PHP        : OK, pdo_pgsql aktif

echo.
echo === [2/7] Login PostgreSQL ===
pg_isready -h %PGHOST% -p %PGPORT% >nul 2>&1
if not errorlevel 1 goto :serverup
sc query postgresql-x64-17 >nul 2>&1
if errorlevel 1 goto :nosvc
echo [GAGAL] Service postgresql-x64-17 ada tetapi belum menyala.
echo         Buka CMD sebagai Administrator lalu jalankan: net start postgresql-x64-17
goto :fail
:nosvc
echo [GAGAL] Server PostgreSQL belum ada / belum terdaftar sebagai service.
echo         Jalankan install-postgres-service.bat sebagai Administrator terlebih dahulu.
goto :fail
:serverup
if defined PGPASSWORD goto :havepw
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "$s = Read-Host 'Password user postgres' -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))"`) do set "PGPASSWORD=%%p"
:havepw
psql -w -tAc "SELECT 1" postgres >nul 2>"%TEMP%\simrs_psql_err.txt"
if not errorlevel 1 goto :loginok
echo [GAGAL] Tidak bisa login ke PostgreSQL. Pesan dari PostgreSQL:
type "%TEMP%\simrs_psql_err.txt"
echo.
echo  - "password authentication failed" : password salah, jalankan ulang lalu ketik password yang benar.
echo  - "Connection refused"               : service PostgreSQL belum jalan, buka services.msc lalu Start postgresql-x64-17.
goto :fail
:loginok
echo Login OK

echo.
echo === [3/7] Database %DB_NAME% ===
set "DB_EXISTS="
for /f "usebackq delims=" %%r in (`psql -w -tAc "SELECT 1 FROM pg_database WHERE datname = '%DB_NAME%'" postgres`) do set "DB_EXISTS=%%r"
if "%DB_EXISTS%"=="1" goto :dbexists
createdb -w %DB_NAME%
if errorlevel 1 goto :fail
echo Database %DB_NAME% dibuat.
goto :dbready
:dbexists
echo Database %DB_NAME% sudah ada.
:dbready

echo.
echo === [4/7] Backend Yii: dependency dan konfigurasi ===
cd /d "%ROOT%backend-yii"
if exist controllers\SiteController.php call cleanup-template.bat
if exist vendor\autoload.php goto :vendorok
echo Menjalankan composer install...
call composer install --no-interaction
if errorlevel 1 goto :fail
:vendorok
if not exist .env copy /y .env.example .env >nul
powershell -NoProfile -Command "$lines = Get-Content .env | ForEach-Object { if ($_ -match '^DB_PASSWORD=') { 'DB_PASSWORD=' + $env:PGPASSWORD } elseif ($_ -match '^DB_NAME=') { 'DB_NAME=' + $env:DB_NAME } else { $_ } }; Set-Content -Path .env -Value $lines -Encoding ASCII"
if errorlevel 1 goto :fail
echo .env siap (password DB diisi otomatis).

echo.
echo === [5/7] Skema database ===
php yii migrate --interactive=0
if errorlevel 1 goto :fail
psql -w -q -v ON_ERROR_STOP=1 -d %DB_NAME% -f "%ROOT%database\003_readonly_user.sql"
if errorlevel 1 goto :fail
echo User read-only app_readonly untuk services-node siap.

echo.
echo === [6/7] Data demo ===
php yii seed/demo
if errorlevel 1 goto :fail

echo.
echo === [7/7] services-node ===
cd /d "%ROOT%services-node"
where npm >nul 2>&1
if errorlevel 1 goto :nonode
if not exist .env copy /y .env.example .env >nul
if exist node_modules goto :nodeok
echo Menjalankan npm install...
call npm install
if errorlevel 1 goto :fail
:nodeok
echo services-node siap.
goto :done
:nonode
echo [LEWATI] npm tidak ditemukan, services-node belum disiapkan.

:done
echo.
echo ==================================================================
echo  SETUP SELESAI
echo  Akun demo   : admin, pendaftaran, dokter.umum, farmasi, lab, kasir
echo  Password    : password123
echo  Backend Yii : http://localhost:8080/api/health
echo  Node        : http://localhost:3001/health
echo ==================================================================
echo.
choice /c YN /m "Jalankan semua service sekarang"
if errorlevel 2 goto :end
call "%ROOT%start-dev.bat"
goto :end

:fail
echo.
echo Setup berhenti karena error di atas.
pause
endlocal
exit /b 1

:end
pause
endlocal
exit /b 0
