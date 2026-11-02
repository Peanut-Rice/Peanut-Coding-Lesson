@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo 需要 Node.js 18 或更新版本：https://nodejs.org/
  echo 安装后重新双击本文件。
  echo.
  pause
  exit /b 1
)
node "%~dp0tools\serve.mjs" .
if errorlevel 1 pause
