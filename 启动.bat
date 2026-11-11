@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

echo 正在启动「声迹」...

netstat -ano | findstr ":8088" | findstr "LISTENING" >nul
if not errorlevel 1 (
  start "" "http://127.0.0.1:8088/"
  exit /b 0
)

if not exist node_modules (
  echo 正在安装依赖，请稍候...
  call npm install
  if errorlevel 1 (
    echo 依赖安装失败，请检查 Node.js 和网络。
    pause
    exit /b 1
  )
)

call npm run build
if errorlevel 1 (
  echo 前端构建失败。
  pause
  exit /b 1
)

start "SoundTrace Server" /min node server/index.js
ping -n 3 127.0.0.1 >nul
start "" "http://127.0.0.1:8088/"
exit /b 0
