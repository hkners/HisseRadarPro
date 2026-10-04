@echo off
echo ==============================================
echo  HisseRadarPro v2.0 - Terminal
echo ==============================================

:: Start Backend (FastAPI)
echo [1/3] Backend baslatiliyor (Port 8015)...
start "HisseRadarPro Backend" cmd /k "cd backend && python main.py"

:: Short pause to let backend start up before frontend
ping 127.0.0.1 -n 3 >nul

:: Start Frontend (Vite Dev Server)
echo [2/3] Frontend baslatiliyor (Vite - Port 5173)...
start "HisseRadarPro Frontend" cmd /k "cd frontend && npm.cmd run dev"

echo.
echo ==============================================
echo  Uygulama calisiyor:
echo    Frontend : http://localhost:5173
echo    Backend  : http://localhost:8015
echo    API Docs : http://localhost:8015/docs
echo ==============================================
echo.
echo Zamanlayiciyi da calistirmak icin:
echo    cd backend ^&^& python scrapers/scheduler.py
echo ==============================================
pause
