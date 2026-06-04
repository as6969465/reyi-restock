@echo off
echo 安裝 Python 套件...
pip install -r requirements.txt -q
echo.
echo 啟動日翊收發進貨平台後端...
echo 開啟瀏覽器：http://localhost:5000
echo.
python server.py
pause
