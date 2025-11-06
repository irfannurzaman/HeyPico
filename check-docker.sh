#!/bin/bash

# Script to check Docker status and provide instructions

echo "🔍 Checking Docker status..."

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed"
    echo "Please install Docker Desktop from: https://www.docker.com/products/docker-desktop"
    exit 1
fi

echo "✅ Docker is installed: $(docker --version)"

if docker info > /dev/null 2>&1; then
    echo "✅ Docker is running"
    echo ""
    echo "You can now run Open WebUI with:"
    echo "  ./start-open-webui.sh"
else
    echo "❌ Docker is not running"
    echo ""
    echo "Please do the following:"
    echo "1. Open Docker Desktop from Applications"
    echo "2. Wait until Docker Desktop shows 'Docker Desktop is running'"
    echo "3. Then run: ./start-open-webui.sh"
    echo ""
    echo "Or run this command to open Docker Desktop:"
    echo "  open -a Docker"
fi


