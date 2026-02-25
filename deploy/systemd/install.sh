#!/bin/bash
# PalmView systemd user services installer (no sudo needed)
# Usage: bash deploy/systemd/install.sh
# On szls: bash ~/projects/palmview/deploy/systemd/install.sh

set -e

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICES=(palmview-db palmview-api palmview-frontend palmview-sam2)
SYSTEMD_USER_DIR="$HOME/.config/systemd/user"

echo "📦 Installing PalmView systemd user services..."
mkdir -p "$SYSTEMD_USER_DIR"
mkdir -p "$HOME/logs/palmview"

for svc in "${SERVICES[@]}"; do
    cp "$DEPLOY_DIR/$svc.service" "$SYSTEMD_USER_DIR/"
    echo "  → Installed $svc.service"
done

systemctl --user daemon-reload

for svc in "${SERVICES[@]}"; do
    systemctl --user enable "$svc"
    echo "  ✅ $svc enabled"
done

echo ""
echo "🚀 Start all services:"
echo "  systemctl --user start palmview-db palmview-sam2 palmview-api palmview-frontend"
echo ""
echo "📋 Check status:"
echo "  systemctl --user status 'palmview-*'"
echo ""
echo "📌 Auto-start on login (run once):"
echo "  loginctl enable-linger hank"
