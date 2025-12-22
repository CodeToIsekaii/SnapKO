@echo off
REM ═══════════════════════════════════════════════════════════════
REM 🚀 SnapKO Quick Deploy Script (Windows)
REM Chạy script này để deploy nhanh
REM ═══════════════════════════════════════════════════════════════

echo.
echo ╔═══════════════════════════════════════════════════════════╗
echo ║                    🚀 SnapKO Deploy                       ║
echo ╚═══════════════════════════════════════════════════════════╝
echo.

echo Chọn hành động:
echo.
echo   1) 🔄 Push code (tự động deploy Functions)
echo   2) 📱 Build Mobile APK
echo   3) 🌐 Deploy Web Landing (Vercel)
echo   4) 🖥️  Release Desktop (tạo tag)
echo   5) ☁️  Deploy Edge Functions (manual)
echo   6) 📊 Xem status
echo   0) ❌ Thoát
echo.
set /p choice="Nhập số (0-6): "

if "%choice%"=="1" goto push_code
if "%choice%"=="2" goto build_mobile
if "%choice%"=="3" goto deploy_web
if "%choice%"=="4" goto release_desktop
if "%choice%"=="5" goto deploy_functions
if "%choice%"=="6" goto status
if "%choice%"=="0" goto exit_script

echo ❌ Lựa chọn không hợp lệ
goto end

:push_code
echo.
set /p message="📝 Nhập commit message: "
echo 🔄 Đang push code...
git add .
git commit -m "%message%"
git push origin main
echo.
echo ✅ Done! GitHub Actions sẽ tự động deploy.
echo 👉 Xem tiến trình tại GitHub Actions
goto end

:build_mobile
echo.
echo 📱 Building Mobile APK...
cd apps\mobile
echo Chọn profile:
echo   1) preview (APK để test)
echo   2) production (AAB cho Play Store)
set /p profile="Nhập số (1-2): "
if "%profile%"=="1" (
    eas build --platform android --profile preview
) else (
    eas build --platform android --profile production
)
cd ..\..
echo ✅ Build hoàn tất!
goto end

:deploy_web
echo.
echo 🌐 Deploying Web Landing...
cd apps\web-landing
vercel --prod
cd ..\..
echo ✅ Web deployed!
goto end

:release_desktop
echo.
set /p version="📝 Nhập version (vd: 1.0.0): v"
cd apps\desktop
call npm version %version% --no-git-tag-version
cd ..\..
git add .
git commit -m "Release desktop v%version%"
git tag "v%version%"
git push origin main
git push origin "v%version%"
echo.
echo ✅ Tag v%version% đã được tạo!
echo 👉 GitHub Actions sẽ tự động build cho Win/Mac/Linux
goto end

:deploy_functions
echo.
echo ☁️  Deploying Edge Functions...
echo   1) Tất cả
echo   2) ai-parse-inventory
echo   3) payment-webhook
set /p func="Nhập số (1-3): "
if "%func%"=="1" supabase functions deploy
if "%func%"=="2" supabase functions deploy ai-parse-inventory
if "%func%"=="3" supabase functions deploy payment-webhook
echo ✅ Functions deployed!
goto end

:status
echo.
echo 📊 Project Status
echo ════════════════════════════════════════
echo.
echo Git Status:
git status -s
echo.
echo Recent Commits:
git log --oneline -5
echo.
echo Tags:
git tag --sort=-v:refname
goto end

:exit_script
echo 👋 Bye!
goto end

:end
echo.
pause
