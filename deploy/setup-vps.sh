#!/bin/bash
# Finance News Radar — VPS 一键部署
# 用法: bash deploy/setup-vps.sh
set -e

DOMAIN="fina.nexar.site"
PROJ_DIR="/opt/finance-news-radar"
LOG_DIR="/var/log/fnr"

echo "=== Finance News Radar 部署到 $DOMAIN ==="

# ── 1. 系统依赖 ──
echo "[1/8] 安装系统依赖..."
sudo apt-get update -qq
sudo apt-get install -y -qq nginx certbot python3-certbot-nginx python3 python3-venv git curl

# Node.js 20
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 20 ]]; then
  echo "  安装 Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi

# PM2 + tsx
sudo npm install -g pm2 tsx 2>/dev/null

# ── 2. 项目目录 ──
echo "[2/8] 准备项目目录..."
sudo mkdir -p "$PROJ_DIR" "$LOG_DIR"
sudo chown "$(whoami):$(whoami)" "$PROJ_DIR" "$LOG_DIR"

if [ -d "$PROJ_DIR/.git" ]; then
  echo "  项目已存在，拉取最新代码..."
  cd "$PROJ_DIR" && git pull origin main
else
  echo "  克隆项目..."
  echo "  请手动执行: git clone <your-repo-url> $PROJ_DIR"
  echo "  然后重新运行此脚本"
  exit 1
fi

# ── 3. Python 环境 ──
echo "[3/8] Python 环境..."
cd "$PROJ_DIR"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
.venv/bin/pip install -q -r requirements.txt

# ── 4. Node.js 依赖 + 构建 ──
echo "[4/8] Node.js 依赖 + 构建..."
npm ci --production=false
npm run build

# ── 5. Playwright 浏览器（雪球爬虫需要）──
echo "[5/8] Playwright chromium..."
npx playwright install chromium 2>/dev/null || true
npx playwright install-deps chromium 2>/dev/null || true

# ── 6. PM2 启动 ──
echo "[6/8] PM2 启动..."
pm2 delete fnr-web 2>/dev/null || true
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup 2>/dev/null || true

# ── 7. Nginx + SSL ──
echo "[7/8] Nginx 配置..."
NGINX_CONF="/etc/nginx/sites-available/finance-radar"
NGINX_LINK="/etc/nginx/sites-enabled/finance-radar"

sudo cp "$PROJ_DIR/deploy/nginx.conf" "$NGINX_CONF"
sudo ln -sf "$NGINX_CONF" "$NGINX_LINK"

# 移除默认站点（如果存在）
sudo rm -f /etc/nginx/sites-enabled/default

# 测试 nginx 配置（SSL 证书可能还没有，先用 HTTP）
# 临时注释掉 SSL 行测试
sudo nginx -t 2>/dev/null || {
  echo "  先申请 SSL 证书再启用 HTTPS..."
  # 创建临时 HTTP-only 配置用于 certbot
  sudo tee /etc/nginx/sites-available/finance-radar-temp > /dev/null << TMPEOF
server {
    listen 80;
    server_name $DOMAIN;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
TMPEOF
  sudo ln -sf /etc/nginx/sites-available/finance-radar-temp "$NGINX_LINK"
  sudo nginx -t && sudo systemctl reload nginx
}

# 申请 SSL 证书
echo "  申请 Let's Encrypt SSL 证书..."
sudo certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@nexar.site --redirect || {
  echo "  ⚠️ SSL 申请失败，请确保 DNS 已指向此服务器，然后手动运行:"
  echo "     sudo certbot --nginx -d $DOMAIN"
}

# 恢复完整 nginx 配置
sudo cp "$PROJ_DIR/deploy/nginx.conf" "$NGINX_CONF"
sudo ln -sf "$NGINX_CONF" "$NGINX_LINK"
sudo nginx -t && sudo systemctl reload nginx

# ── 8. Cron 定时任务 ──
echo "[8/8] 安装 cron 定时任务..."
bash "$PROJ_DIR/deploy/setup-cron.sh"

echo ""
echo "=== 部署完成 ==="
echo "  站点: https://$DOMAIN"
echo "  PM2:  pm2 status / pm2 logs fnr-web"
echo "  日志: $LOG_DIR/"
echo ""
echo "首次运行数据采集（可选）:"
echo "  cd $PROJ_DIR && .venv/bin/python scripts/update_finance.py --output-dir data --window-hours 24"
