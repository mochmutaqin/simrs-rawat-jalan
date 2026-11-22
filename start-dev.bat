@echo off
REM Menyalakan semua service SIMRS dalam jendela terpisah. Tutup jendelanya untuk menghentikan service.
set "ROOT=%~dp0"

start "SIMRS - Backend Yii :8080" cmd /k "cd /d "%ROOT%backend-yii" && php yii serve 0.0.0.0:8080"
start "SIMRS - services-node :3001" cmd /k "cd /d "%ROOT%services-node" && node --env-file=.env src/server.js"
start "SIMRS - Outbox worker" cmd /k "cd /d "%ROOT%backend-yii" && php yii outbox/run"
start "SIMRS - Frontend :5173" cmd /k "cd /d "%ROOT%frontend" && npm run dev"

echo Service dijalankan di 4 jendela baru:
echo   Aplikasi      http://localhost:5173
echo   Backend Yii   http://localhost:8080/api/health
echo   services-node http://localhost:3001/health
echo   Outbox worker kirim event Yii ke Node
echo.
echo Membuka aplikasi di browser...
timeout /t 6 /nobreak >nul
start "" http://localhost:5173
