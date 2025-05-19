#!/bin/bash

echo "Testing NPX installation directly..."

# Change to /tmp to avoid any local file access
cd /tmp

# Set all required environment variables
export ELIZAOS_SERVER_URL="http://localhost:3000"
export ELIZAOS_USER_ID="ad64a76a-0e09-0899-b8f8-492d6aea4118"
export ELIZAOS_WORLD_ID="c930b151-dcfb-41c5-96af-550ffea7023c"
export ELIZAOS_AGENT_ID="85e9fa66-6f8c-0f18-922c-d6c962e21e18"
export ELIZAOS_ROOM_ID="85e9fa66-6f8c-0f18-922c-d6c962e21e18"
export PORT="3099"
export DEBUG="true"

echo "Environment variables set, running NPX package..."
npx -y society-elizaos-mcp@1.0.9

echo "NPX package exited with status $?" 