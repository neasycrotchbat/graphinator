@echo off
REM ============================================================
REM  Graphinator — install for After Effects (Windows)
REM  1. Enables unsigned CEP panels (PlayerDebugMode) for the
REM     CEP runtimes used by AE 2024 (CSXS.11) and AE 2025 (CSXS.12).
REM  2. Copies this folder to the per-user CEP extensions folder.
REM  Run this file again after pulling updates. Restart AE afterwards.
REM ============================================================

set "SRC=%~dp0"
set "SRC=%SRC:~0,-1%"
set "DEST=%APPDATA%\Adobe\CEP\extensions\Graphinator"

echo Enabling unsigned CEP panels (PlayerDebugMode)...
reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f >nul
reg add HKCU\Software\Adobe\CSXS.12 /v PlayerDebugMode /t REG_SZ /d 1 /f >nul

echo Copying panel to: %DEST%
robocopy "%SRC%" "%DEST%" /E /NFL /NDL /NJH /NJS /XD .git /XF install.bat README.md >nul

if %ERRORLEVEL% GEQ 8 (
  echo.
  echo COPY FAILED - close After Effects and try again.
  pause
  exit /b 1
)

echo.
echo Installed. Restart After Effects, then open:
echo   Window ^> Extensions ^> Graphinator
echo.
pause
