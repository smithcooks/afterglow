@echo off
setlocal
cd /d "%~dp0"
set "electron_config_cache=%~dp0.setup-cache\electron"
call npm.cmd install --cache "%~dp0.setup-cache\npm" --no-fund --no-audit
if errorlevel 1 goto failed
node node_modules\electron\install.js
if errorlevel 1 goto failed
echo Afterglow is ready. Open Start Afterglow.cmd.
pause
exit /b 0
:failed
echo Setup failed. Check the output above, then try again.
pause
exit /b 1
