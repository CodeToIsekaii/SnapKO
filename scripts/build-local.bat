@echo off
REM ═══════════════════════════════════════════════════════════════
REM 🔧 SnapKO Local Build & Deploy Script (Truyền thống)
REM Build tất cả ở local, sau đó upload lên server
REM ═══════════════════════════════════════════════════════════════

chcp 65001 >nul
setlocal enabledelayedexpansion

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║           🔧 SnapKO Local Build ^& Deploy                      ║
echo ║              (Cách truyền thống - Build tại máy)               ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

echo Chọn hành động:
echo.
echo   ═══ BUILD LOCAL ═══
echo   1) 📱 Build Mobile APK (Android)
echo   2) 🌐 Build Web Landing
echo   3) 🖥️  Build Desktop (Windows .exe)
echo.
echo   ═══ DEPLOY LEN SERVER ═══
echo   4) ☁️  Deploy Edge Functions lên Supabase
echo   5) 🌐 Upload Web lên VPS (Docker)
echo   6) 📦 Upload tất cả lên VPS
echo.
echo   ═══ KHAC ═══
echo   7) 🧹 Clean build cũ
echo   8) 📊 Xem thông tin project
echo   0) ❌ Thoát
echo.
set /p choice="Nhập số (0-8): "

if "%choice%"=="1" goto build_mobile
if "%choice%"=="2" goto build_web
if "%choice%"=="3" goto build_desktop
if "%choice%"=="4" goto deploy_functions
if "%choice%"=="5" goto deploy_web_vps
if "%choice%"=="6" goto deploy_all_vps
if "%choice%"=="7" goto clean
if "%choice%"=="8" goto info
if "%choice%"=="0" goto exit_script

echo ❌ Lựa chọn không hợp lệ
goto end

REM ═══════════════════════════════════════════════════════════════
REM BUILD MOBILE APK
REM ═══════════════════════════════════════════════════════════════
:build_mobile
echo.
echo ════════════════════════════════════════════════════════════════
echo                    📱 BUILD MOBILE APK
echo ════════════════════════════════════════════════════════════════
echo.

cd apps\mobile

REM Kiểm tra EAS đã cài chưa
where eas >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️ EAS CLI chưa được cài. Đang cài đặt...
    npm install -g eas-cli
)

echo Chọn profile:
echo   1) development (Dev client)
echo   2) preview (APK để test - KHUYÊN DÙNG)
echo   3) production (AAB cho Play Store)
set /p profile="Nhập số (1-3): "

if "%profile%"=="1" (
    echo 🔄 Building development...
    eas build --platform android --profile development --local
) else if "%profile%"=="2" (
    echo 🔄 Building preview APK...
    eas build --platform android --profile preview --local
) else (
    echo 🔄 Building production AAB...
    eas build --platform android --profile production --local
)

cd ..\..
echo.
echo ✅ Build hoàn tất!
echo 📁 File APK nằm trong thư mục: apps\mobile\
echo.
echo Tiếp theo:
echo   - Cài APK lên điện thoại để test
echo   - Hoặc upload lên Play Console nếu là production
goto end

REM ═══════════════════════════════════════════════════════════════
REM BUILD WEB LANDING
REM ═══════════════════════════════════════════════════════════════
:build_web
echo.
echo ════════════════════════════════════════════════════════════════
echo                    🌐 BUILD WEB LANDING
echo ════════════════════════════════════════════════════════════════
echo.

cd apps\web-landing

echo 🔄 Installing dependencies...
call pnpm install

echo 🔄 Building...
call pnpm build

cd ..\..

echo.
echo ✅ Build hoàn tất!
echo 📁 Output nằm trong: apps\web-landing\.next\
echo 📁 Hoặc standalone: apps\web-landing\.next\standalone\
echo.
echo Tiếp theo:
echo   Option 1: Deploy lên Vercel: vercel --prod
echo   Option 2: Build Docker và deploy lên VPS (chọn menu 5)
goto end

REM ═══════════════════════════════════════════════════════════════
REM BUILD DESKTOP
REM ═══════════════════════════════════════════════════════════════
:build_desktop
echo.
echo ════════════════════════════════════════════════════════════════
echo                    🖥️ BUILD DESKTOP APP
echo ════════════════════════════════════════════════════════════════
echo.

cd apps\desktop

echo 🔄 Installing dependencies...
call pnpm install

echo 🔄 Rebuilding native modules (SQLite)...
call pnpm rebuild-sqlite

echo 🔄 Building app...
call pnpm build

echo 🔄 Packaging for Windows...
call pnpm dist:win

cd ..\..

echo.
echo ✅ Build hoàn tất!
echo 📁 File installer nằm trong: apps\desktop\release\
echo.
echo Các file đã tạo:
dir apps\desktop\release\*.exe 2>nul
echo.
echo Tiếp theo:
echo   - Test installer trên máy
echo   - Chia sẻ file .exe cho người dùng
echo   - Upload lên trang download
goto end

REM ═══════════════════════════════════════════════════════════════
REM DEPLOY EDGE FUNCTIONS
REM ═══════════════════════════════════════════════════════════════
:deploy_functions
echo.
echo ════════════════════════════════════════════════════════════════
echo                    ☁️ DEPLOY EDGE FUNCTIONS
echo ════════════════════════════════════════════════════════════════
echo.

REM Kiểm tra Supabase CLI
where supabase >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️ Supabase CLI chưa được cài. Đang cài đặt...
    npm install -g supabase
)

echo Chọn function để deploy:
echo   1) ✨ Tất cả functions
echo   2) 🤖 ai-parse-inventory
echo   3) 🤖 ai-parse-menu
echo   4) 💰 payment-webhook
echo   5) 🔄 sync-up
echo   6) 👥 invite-create
echo   7) 👥 invite-join
echo   8) 👥 invite-approve
echo   9) 🗑️ user-delete
set /p func="Nhập số (1-9): "

if "%func%"=="1" (
    echo 🔄 Deploying all functions...
    supabase functions deploy
) else if "%func%"=="2" (
    supabase functions deploy ai-parse-inventory
) else if "%func%"=="3" (
    supabase functions deploy ai-parse-menu
) else if "%func%"=="4" (
    supabase functions deploy payment-webhook
) else if "%func%"=="5" (
    supabase functions deploy sync-up
) else if "%func%"=="6" (
    supabase functions deploy invite-create
) else if "%func%"=="7" (
    supabase functions deploy invite-join
) else if "%func%"=="8" (
    supabase functions deploy invite-approve
) else if "%func%"=="9" (
    supabase functions deploy user-delete
)

echo.
echo ✅ Deploy hoàn tất!
goto end

REM ═══════════════════════════════════════════════════════════════
REM DEPLOY WEB LÊN VPS (DOCKER)
REM ═══════════════════════════════════════════════════════════════
:deploy_web_vps
echo.
echo ════════════════════════════════════════════════════════════════
echo                    🌐 DEPLOY WEB LÊN VPS
echo ════════════════════════════════════════════════════════════════
echo.

set /p server_ip="Nhập IP của VPS: "
set /p server_user="Nhập username SSH (mặc định: root): "
if "%server_user%"=="" set server_user=root

REM Kiểm tra Docker
where docker >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Docker chưa được cài đặt!
    echo 👉 Tải Docker Desktop tại: https://docker.com/products/docker-desktop
    goto end
)

echo.
echo 🔄 Bước 1: Build Docker image...
cd apps\web-landing
docker build -t snapko-web:latest .

echo.
echo 🔄 Bước 2: Save image thành file...
docker save snapko-web:latest -o snapko-web.tar

echo.
echo 🔄 Bước 3: Upload lên VPS...
echo (Cần nhập mật khẩu SSH)
scp snapko-web.tar %server_user%@%server_ip%:/tmp/

echo.
echo 🔄 Bước 4: Load image và chạy trên VPS...
ssh %server_user%@%server_ip% "docker load -i /tmp/snapko-web.tar && docker stop snapko-web 2>/dev/null; docker rm snapko-web 2>/dev/null; docker run -d --name snapko-web -p 3000:3000 --restart unless-stopped snapko-web:latest && rm /tmp/snapko-web.tar"

REM Xóa file local
del snapko-web.tar

cd ..\..

echo.
echo ✅ Deploy hoàn tất!
echo 🌐 Website đang chạy tại: http://%server_ip%:3000
goto end

REM ═══════════════════════════════════════════════════════════════
REM DEPLOY TẤT CẢ LÊN VPS
REM ═══════════════════════════════════════════════════════════════
:deploy_all_vps
echo.
echo ════════════════════════════════════════════════════════════════
echo                    📦 DEPLOY TẤT CẢ LÊN VPS
echo ════════════════════════════════════════════════════════════════
echo.

set /p server_ip="Nhập IP của VPS: "
set /p server_user="Nhập username SSH (mặc định: root): "
if "%server_user%"=="" set server_user=root

echo.
echo Sẽ thực hiện:
echo   1. Build Web Landing
echo   2. Build Docker image
echo   3. Upload lên VPS
echo   4. Deploy Edge Functions
echo.
set /p confirm="Tiếp tục? (y/n): "
if /i not "%confirm%"=="y" goto end

echo.
echo ═══ BƯỚC 1: Build Web Landing ═══
cd apps\web-landing
call pnpm install
call pnpm build
docker build -t snapko-web:latest .
docker save snapko-web:latest -o snapko-web.tar
cd ..\..

echo.
echo ═══ BƯỚC 2: Upload lên VPS ═══
scp apps\web-landing\snapko-web.tar %server_user%@%server_ip%:/tmp/

echo.
echo ═══ BƯỚC 3: Deploy trên VPS ═══
ssh %server_user%@%server_ip% "docker load -i /tmp/snapko-web.tar && docker stop snapko-web 2>/dev/null; docker rm snapko-web 2>/dev/null; docker run -d --name snapko-web -p 3000:3000 --restart unless-stopped snapko-web:latest && rm /tmp/snapko-web.tar"

del apps\web-landing\snapko-web.tar

echo.
echo ═══ BƯỚC 4: Deploy Edge Functions ═══
supabase functions deploy

echo.
echo ════════════════════════════════════════════════════════════════
echo                         ✅ HOÀN TẤT!
echo ════════════════════════════════════════════════════════════════
echo.
echo 🌐 Web: http://%server_ip%:3000
echo ☁️ Functions: Đã deploy lên Supabase
echo.
echo Nhớ cấu hình:
echo   - Nginx reverse proxy (port 80/443)
echo   - SSL certificate (Let's Encrypt)
goto end

REM ═══════════════════════════════════════════════════════════════
REM CLEAN
REM ═══════════════════════════════════════════════════════════════
:clean
echo.
echo 🧹 Cleaning build files...

if exist apps\web-landing\.next (
    rmdir /s /q apps\web-landing\.next
    echo   ✓ Deleted apps\web-landing\.next
)

if exist apps\desktop\release (
    rmdir /s /q apps\desktop\release
    echo   ✓ Deleted apps\desktop\release
)

if exist apps\desktop\dist (
    rmdir /s /q apps\desktop\dist
    echo   ✓ Deleted apps\desktop\dist
)

echo.
echo ✅ Clean hoàn tất!
goto end

REM ═══════════════════════════════════════════════════════════════
REM INFO
REM ═══════════════════════════════════════════════════════════════
:info
echo.
echo ════════════════════════════════════════════════════════════════
echo                       📊 PROJECT INFO
echo ════════════════════════════════════════════════════════════════
echo.

echo 📁 Project Structure:
echo    SnapKO\
echo    ├── apps\
echo    │   ├── mobile\     (Expo React Native)
echo    │   ├── web-landing\ (Next.js)
echo    │   └── desktop\    (Electron)
echo    ├── supabase\
echo    │   └── functions\  (Edge Functions)
echo    └── packages\       (Shared code)
echo.

echo 🔧 Installed Tools:
where node >nul 2>&1 && (
    for /f "tokens=*" %%i in ('node -v') do echo    Node.js: %%i
) || echo    Node.js: ❌ Chưa cài
where pnpm >nul 2>&1 && (
    for /f "tokens=*" %%i in ('pnpm -v') do echo    pnpm: %%i
) || echo    pnpm: ❌ Chưa cài
where docker >nul 2>&1 && (
    for /f "tokens=*" %%i in ('docker -v') do echo    Docker: %%i
) || echo    Docker: ❌ Chưa cài
where supabase >nul 2>&1 && echo    Supabase CLI: ✅ || echo    Supabase CLI: ❌ Chưa cài
where eas >nul 2>&1 && echo    EAS CLI: ✅ || echo    EAS CLI: ❌ Chưa cài

echo.
echo 📦 Build Outputs:
if exist apps\web-landing\.next echo    Web: apps\web-landing\.next\ ✅
if not exist apps\web-landing\.next echo    Web: Chưa build
if exist apps\desktop\release echo    Desktop: apps\desktop\release\ ✅
if not exist apps\desktop\release echo    Desktop: Chưa build

goto end

:exit_script
echo 👋 Bye!

:end
echo.
pause
