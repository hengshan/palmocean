#!/bin/bash
# PalmView systemd services installer
# Usage: bash deploy/systemd/install.sh

set -e

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICES=(palmview-db palmview-api palmview-frontend palmview-sam2)

echo "📦 Installing PalmView systemd services..."

# Create log directory (no sudo needed)
mkdir -p /home/hank/logs/palmview

# Copy unit files
for svc in "${SERVICES[@]}"; do
    echo "  → Installing $svc.service"
    sudo cp "$DEPLOY_DIR/$svc.service" /etc/systemd/system/
done

# Reload and enable
sudo systemctl daemon-reload

for svc in "${SERVICES[@]}"; do
    sudo systemctl enable "$svc"
    echo "  ✅ $svc enabled"
done

echo ""
echo "🚀 Start all services:"
echo "  sudo systemctl start palmview-db"
echo "  sudo systemctl start palmview-sam2"
echo "  sudo systemctl start palmview-api"
echo "  sudo systemctl start palmview-frontend"
echo ""
echo "📋 Check status:"
echo "  sudo systemctl status 'palmview-*'"
