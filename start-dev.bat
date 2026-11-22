@echo off
REM Menyalakan semua service SIMRS dalam jendela terpisah.
REM Tutup jendelanya untuk menghentikan service.
set "ROOT=%~dp0"

start "SIMRS - Backend Yii :8080" cmd /k "cd /d "%ROOT%backend-yii" && php yii serve 0.0.0.0:8080"
start "SIMRS - services-node :3001" cmd /k "cd /d "%ROOT%services-node" && node --env-file=.env src/server.js"
start "SIMRS - Outbox worker" cmd /k "cd /d "%ROOT%backend-yii" && php yii outbox/run"

echo Service dijalankan di 3 jendela baru:
echo   Backend Yii   http://localhost:8080/api/health
echo   services-node http://localhost:3001/health
echo   Outbox worker kirim event Yii ke Node
