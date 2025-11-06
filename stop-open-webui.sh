#!/bin/bash

# Script to stop Open WebUI

echo "🛑 Stopping Open WebUI..."

if docker ps | grep -q "open-webui"; then
    docker stop open-webui
    echo "✅ Open WebUI stopped"
else
    echo "ℹ️  Open WebUI is not running"
fi


