#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# 🚀 SnapKO Quick Deploy Script
# Chạy script này để deploy nhanh thay vì gõ nhiều lệnh
# ═══════════════════════════════════════════════════════════════

set -e  # Dừng nếu có lỗi

# Màu sắc cho terminal
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logo
echo -e "${BLUE}"
echo "╔═══════════════════════════════════════════════════════════╗"
echo "║                    🚀 SnapKO Deploy                       ║"
echo "╚═══════════════════════════════════════════════════════════╝"
echo -e "${NC}"

# Menu
echo "Chọn hành động:"
echo ""
echo "  1) 🔄 Push code (tự động deploy Functions)"
echo "  2) 📱 Build Mobile APK"
echo "  3) 🌐 Deploy Web Landing (Vercel)"
echo "  4) 🖥️  Release Desktop (tạo tag)"
echo "  5) ☁️  Deploy Edge Functions (manual)"
echo "  6) 📊 Xem status"
echo "  0) ❌ Thoát"
echo ""
read -p "Nhập số (0-6): " choice

case $choice in
  1)
    echo -e "${YELLOW}📝 Nhập commit message:${NC}"
    read -p "> " message
    
    echo -e "${GREEN}🔄 Đang push code...${NC}"
    git add .
    git commit -m "$message"
    git push origin main
    
    echo -e "${GREEN}✅ Done! GitHub Actions sẽ tự động deploy.${NC}"
    echo -e "${BLUE}👉 Xem tiến trình tại: https://github.com/YOUR_USERNAME/SnapKO/actions${NC}"
    ;;
    
  2)
    echo -e "${GREEN}📱 Building Mobile APK...${NC}"
    cd apps/mobile
    
    # Kiểm tra EAS đã login chưa
    if ! eas whoami > /dev/null 2>&1; then
      echo -e "${YELLOW}⚠️ Chưa đăng nhập EAS. Đang đăng nhập...${NC}"
      eas login
    fi
    
    echo "Chọn profile:"
    echo "  1) preview (APK để test)"
    echo "  2) production (AAB cho Play Store)"
    read -p "Nhập số (1-2): " profile
    
    if [ "$profile" == "1" ]; then
      eas build --platform android --profile preview
    else
      eas build --platform android --profile production
    fi
    
    cd ../..
    echo -e "${GREEN}✅ Build hoàn tất! Link APK ở trên.${NC}"
    ;;
    
  3)
    echo -e "${GREEN}🌐 Deploying Web Landing...${NC}"
    
    # Kiểm tra Vercel CLI
    if ! command -v vercel &> /dev/null; then
      echo -e "${YELLOW}📦 Cài đặt Vercel CLI...${NC}"
      npm install -g vercel
    fi
    
    cd apps/web-landing
    vercel --prod
    cd ../..
    
    echo -e "${GREEN}✅ Web deployed!${NC}"
    ;;
    
  4)
    echo -e "${GREEN}🖥️ Releasing Desktop...${NC}"
    echo -e "${YELLOW}📝 Nhập version (vd: 1.0.0):${NC}"
    read -p "> v" version
    
    # Cập nhật version trong package.json
    cd apps/desktop
    npm version $version --no-git-tag-version
    cd ../..
    
    # Commit và tạo tag
    git add .
    git commit -m "Release desktop v$version"
    git tag "v$version"
    git push origin main
    git push origin "v$version"
    
    echo -e "${GREEN}✅ Tag v$version đã được tạo!${NC}"
    echo -e "${BLUE}👉 GitHub Actions sẽ tự động build cho Win/Mac/Linux${NC}"
    echo -e "${BLUE}👉 Xem tại: https://github.com/YOUR_USERNAME/SnapKO/releases${NC}"
    ;;
    
  5)
    echo -e "${GREEN}☁️ Deploying Edge Functions...${NC}"
    
    # Kiểm tra Supabase CLI
    if ! command -v supabase &> /dev/null; then
      echo -e "${YELLOW}📦 Cài đặt Supabase CLI...${NC}"
      npm install -g supabase
    fi
    
    # Kiểm tra đăng nhập
    if ! supabase projects list > /dev/null 2>&1; then
      echo -e "${YELLOW}⚠️ Chưa đăng nhập Supabase. Đang đăng nhập...${NC}"
      supabase login
    fi
    
    echo "Deploy function nào?"
    echo "  1) Tất cả"
    echo "  2) ai-parse-inventory"
    echo "  3) payment-webhook"
    echo "  4) sync-up"
    read -p "Nhập số (1-4): " func
    
    case $func in
      1) supabase functions deploy ;;
      2) supabase functions deploy ai-parse-inventory ;;
      3) supabase functions deploy payment-webhook ;;
      4) supabase functions deploy sync-up ;;
    esac
    
    echo -e "${GREEN}✅ Functions deployed!${NC}"
    ;;
    
  6)
    echo -e "${BLUE}📊 Project Status${NC}"
    echo "════════════════════════════════════════"
    
    echo -e "\n${YELLOW}Git Status:${NC}"
    git status -s
    
    echo -e "\n${YELLOW}Recent Commits:${NC}"
    git log --oneline -5
    
    echo -e "\n${YELLOW}Tags:${NC}"
    git tag --sort=-v:refname | head -5
    
    echo -e "\n${YELLOW}Remote:${NC}"
    git remote -v
    ;;
    
  0)
    echo -e "${GREEN}👋 Bye!${NC}"
    exit 0
    ;;
    
  *)
    echo -e "${RED}❌ Lựa chọn không hợp lệ${NC}"
    exit 1
    ;;
esac
