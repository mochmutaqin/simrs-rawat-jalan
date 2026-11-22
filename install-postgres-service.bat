@echo off
REM Author: Mochamad Mutaqin Kurniawan <mochmutaqin@gmail.com>
setlocal EnableExtensions
REM ==================================================================
REM  Membuat database server PostgreSQL 17 + Windows service
REM  untuk instalasi yang folder "data"-nya tidak ada (installer gagal
REM  di tahap inisialisasi). WAJIB dijalankan sebagai Administrator.
REM  Aman dijalankan ulang.
REM ==================================================================

set "PG_BIN=C:\Program Files\PostgreSQL\17\bin"
set "PG_ROOT=D:\PostgreSQL\17"
set "PG_DATA=%PG_ROOT%\data"
set "SVC=postgresql-x64-17"

net session >nul 2>&1
if not errorlevel 1 goto :isadmin
echo [GAGAL] Jalankan file ini sebagai Administrator:
echo         klik kanan Command Prompt, pilih Run as administrator.
goto :fail
:isadmin

if exist "%PG_BIN%\initdb.exe" goto :binok
echo [GAGAL] initdb.exe tidak ditemukan di "%PG_BIN%".
goto :fail
:binok

sc query %SVC% >nul 2>&1
if not errorlevel 1 goto :startsvc

if exist "%PG_DATA%\PG_VERSION" goto :register

echo.
echo === [1/3] Membuat database server di %PG_DATA% ===
echo Buat password untuk user postgres. Saran: postgres
for /f "usebackq delims=" %%p in (`powershell -NoProfile -Command "$s = Read-Host 'Password baru user postgres' -AsSecureString; [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))"`) do set "NEWPW=%%p"
if not defined NEWPW (
  echo [GAGAL] Password tidak boleh kosong.
  goto :fail
)
powershell -NoProfile -Command "[IO.File]::WriteAllText((Join-Path $env:TEMP 'simrs_pw.txt'), $env:NEWPW)"
if not exist "%PG_DATA%" mkdir "%PG_DATA%"
REM initdb berjalan dengan token terbatas (tanpa hak Administrator), jadi akun ini perlu hak tulis eksplisit
icacls "%PG_ROOT%" /grant "%USERNAME%:(OI)(CI)F" /T >nul
"%PG_BIN%\initdb.exe" -D "%PG_DATA%" -U postgres -E UTF8 --locale=C -A scram-sha-256 --pwfile="%TEMP%\simrs_pw.txt"
set "INITDB_RC=%ERRORLEVEL%"
del /q "%TEMP%\simrs_pw.txt" >nul 2>&1
if not "%INITDB_RC%"=="0" goto :fail

:register
echo.
echo === [2/3] Mendaftarkan Windows service %SVC% ===
REM S-1-5-20 = akun NETWORK SERVICE (nama akun berbeda di Windows non-Inggris, SID selalu sama)
icacls "%PG_ROOT%" /grant "*S-1-5-20:(OI)(CI)F" /T >nul
if errorlevel 1 goto :fail
"%PG_BIN%\pg_ctl.exe" register -N %SVC% -U "NT AUTHORITY\NetworkService" -D "%PG_DATA%" -S auto
if errorlevel 1 goto :fail

:startsvc
echo.
echo === [3/3] Menyalakan service ===
net start %SVC%
"%PG_BIN%\pg_isready.exe" -h localhost -p 5432 -t 15
if errorlevel 1 goto :fail

echo.
echo ==================================================================
echo  PostgreSQL 17 siap di localhost:5432, menyala otomatis saat boot.
echo  Data   : %PG_DATA%
echo  Lanjut : setup-windows.bat, lalu ketik password user postgres tadi.
echo ==================================================================
pause
endlocal
exit /b 0

:fail
echo.
echo Berhenti karena error di atas. Log server: %PG_DATA%\log
pause
endlocal
exit /b 1
