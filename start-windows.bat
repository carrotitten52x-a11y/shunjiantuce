@echo off
chcp 65001 >nul
REM ================= 瞬间图册 · 本机服务器一键启动 =================
REM 作用：在你这台 Windows 电脑上跑起云端服务器，图片直接存到 D:\1【图片】
REM 用法：双击本文件即可。首次运行会自动安装依赖（需已装 Node.js）。
REM 跨设备访问：同一 WiFi 下，其它设备浏览器打开  http://本机IP:3000
REM   本机 IP 查看：命令行运行  ipconfig  （找 IPv4 地址，如 192.168.1.23）

cd /d %~dp0

REM ---- 存储位置配置（改这两行即可换目录）----
set "UPLOAD_ROOT=D:\1【图片】"
set "DATA_ROOT=D:\1【图片】\sj-data"

REM ---- 确保目录存在 ----
if not exist "%UPLOAD_ROOT%" mkdir "%UPLOAD_ROOT%"
if not exist "%DATA_ROOT%" mkdir "%DATA_ROOT%"

REM ---- 检查 Node ----
where node >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 Node.js，请先到 https://nodejs.org 安装 LTS 版本后重试。
  pause
  exit /b 1
)

REM ---- 首次安装依赖 ----
if not exist "node_modules" (
  echo 首次运行，正在安装依赖，请稍候...
  call npm install --omit=dev
)

echo.
echo 启动瞬间图册服务器...
echo 本机访问:   http://127.0.0.1:3000
echo 跨设备访问: http://你的本机IP:3000   （IP 用 ipconfig 查）
echo 图片存储:   %UPLOAD_ROOT%
echo 数据存储:   %DATA_ROOT%
echo.
echo 若首次弹出 Windows 防火墙提示，请勾选「专用网络」并点「允许访问」。
echo 关闭本窗口即停止服务器。
echo.

node server.js
pause
