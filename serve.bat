@echo off
setlocal
cd /d "%~dp0"
echo.
echo   The League of Ordinary Gentlemen - local preview
echo   ------------------------------------------------
echo   Starting a small web server in this folder.
echo   Your browser will open automatically.
echo.
echo   Leave this window open while you browse.
echo   Close it (or press Ctrl+C) when you are done.
echo.

where py >nul 2>nul
if %errorlevel%==0 goto usepy

where python >nul 2>nul
if %errorlevel%==0 goto usepython

where node >nul 2>nul
if %errorlevel%==0 goto usenode

echo   Could not find Python or Node.js on this computer.
echo   You can still preview with the VS Code "Live Server" extension:
echo   right-click index.html and choose "Open with Live Server".
echo.
pause
exit /b

:usepy
start "" http://localhost:8000/
py -m http.server 8000
exit /b

:usepython
start "" http://localhost:8000/
python -m http.server 8000
exit /b

:usenode
start "" http://localhost:8000/
npx --yes http-server -p 8000 -c-1
exit /b
