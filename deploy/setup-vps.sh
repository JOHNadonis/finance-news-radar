#!/bin/bash
# Initial VPS setup for finance-news-radar
set -e

PROJ_DIR="/opt/finance-news-radar"

# System packages
sudo apt-get update
sudo apt-get install -y nodejs npm python3 python3-venv nginx certbot python3-certbot-nginx

# Node.js 20 via nodesource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# PM2
sudo npm install -g pm2 tsx

# Clone repo
sudo mkdir -p "$PROJ_DIR"
sudo chown "$(whoami):$(whoami)" "$PROJ_DIR"
git clone https://github.com/YOUR_USERNAME/finance-news-radar.git "$PROJ_DIR"
cd "$PROJ_DIR"

# Python venv
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

# Playwright browser
npx playwright install chromium
npx playwright install-deps chromium

# Node dependencies
npm ci

# Build
npm run build

# PM2 start
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup

# Log directory
sudo mkdir -p /var/log/fnr
sudo chown "$(whoami):$(whoami)" /var/log/fnr

# Setup cron
bash deploy/setup-cron.sh

# Nginx (requires domain setup)
echo "Next steps:"
echo "1. Copy deploy/nginx.conf to /etc/nginx/sites-available/finance-radar"
echo "2. Replace DOMAIN_PLACEHOLDER with your domain"
echo "3. sudo ln -s /etc/nginx/sites-available/finance-radar /etc/nginx/sites-enabled/"
echo "4. sudo certbot --nginx -d your-domain.com"
echo "5. sudo nginx -t && sudo systemctl reload nginx"
