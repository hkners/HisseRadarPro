@echo off
echo ==============================================
echo  HisseRadarPro - Veri Senkronizasyonu
echo ==============================================

:: Run the plugin-based scraper pipeline
echo [1/2] Fintables analist verileri cekiliyor...
cd backend
python run_all_scrapers.py
cd ..

echo.
echo ==============================================
echo  Senkronizasyon tamamlandi.
echo  Verileri goruntulemek icin frontend'i acin:
echo    http://localhost:5173
echo ==============================================
pause
