#!/bin/bash

# Script to start Open WebUI with Docker
# Make sure Docker Desktop is running before executing this script

echo "🚀 Starting Open WebUI..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop first."
    exit 1
fi

# Check if container already exists
if docker ps -a | grep -q "open-webui"; then
    echo "📦 Open WebUI container exists. Starting existing container..."
    docker start open-webui
else
    echo "📦 Creating and starting Open WebUI container..."
    docker run -d \
      -p 8080:3000 \
      -e OLLAMA_BASE_URL=http://host.docker.internal:11434 \
      -v open-webui:/app/backend/data \
      --name open-webui \
      --add-host=host.docker.internal:host-gateway \
      --restart unless-stopped \
      ghcr.io/open-webui/open-webui:main
fi

# Wait a few seconds for container to start
sleep 3

# Check if container is running
if docker ps | grep -q "open-webui"; then
    echo "✅ Open WebUI is running!"
    echo "🌐 Access it at: http://localhost:8080"
    echo ""
    echo "Note: Make sure Ollama is running if you want to use local LLM models."
    echo "To install Ollama: https://ollama.com/download"
else
    echo "❌ Failed to start Open WebUI. Check Docker logs:"
    echo "   docker logs open-webui"
fi


