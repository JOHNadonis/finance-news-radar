#!/bin/bash
# Setup cron jobs for finance-news-radar data collection
# Run as the deploy user on VPS

PROJ_DIR="/opt/finance-news-radar"
VENV="$PROJ_DIR/.venv/bin/python"
LOG_DIR="/var/log/fnr"

mkdir -p "$LOG_DIR"

# Write crontab
cat > /tmp/fnr-cron << 'EOF'
# Finance News Radar — data collection every 15 minutes
*/15 * * * * cd /opt/finance-news-radar && .venv/bin/python scripts/update_finance.py --output-dir data --window-hours 24 >> /var/log/fnr/update.log 2>&1
*/15 * * * * cd /opt/finance-news-radar && .venv/bin/python scripts/fetch_sentiment.py --output-dir data >> /var/log/fnr/sentiment.log 2>&1
*/15 * * * * cd /opt/finance-news-radar && .venv/bin/python scripts/fetch_calendar.py --output-dir data >> /var/log/fnr/calendar.log 2>&1
*/15 * * * * cd /opt/finance-news-radar && .venv/bin/python scripts/generate_summary.py --data-dir data --output-dir data --no-llm >> /var/log/fnr/summary.log 2>&1
# Notifications (after data update, offset by 2 minutes)
2,17,32,47 * * * * cd /opt/finance-news-radar && .venv/bin/python scripts/notify.py --data-dir data >> /var/log/fnr/notify.log 2>&1
EOF

crontab /tmp/fnr-cron
rm /tmp/fnr-cron
echo "Cron jobs installed:"
crontab -l
