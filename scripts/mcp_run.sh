#!/bin/bash

# Society ElizaOS MCP Server Runner
# Enhanced script to run the ElizaOS MCP server with various options

# Exit immediately if a command exits with a non-zero status.
set -e

# Default values
DEBUG="true"
BUILD=true
PORT="3069"
LOG_PATH="/tmp/mcp-debug.log"
VIEW_LOGS=false
TAIL_LOGS=false
VERSION="local" # local or npx

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  key="$1"
  case $key in
    --no-build)
      BUILD=false
      shift
      ;;
    --port)
      PORT="$2"
      shift 2
      ;;
    --debug)
      DEBUG="true"
      shift
      ;;
    --no-debug)
      DEBUG=""
      shift
      ;;
    --logs)
      VIEW_LOGS=true
      shift
      ;;
    --tail)
      TAIL_LOGS=true
      shift
      ;;
    --npx)
      VERSION="npx"
      shift
      ;;
    --help)
      echo "Usage: ./mcp_run.sh [OPTIONS]"
      echo "Options:"
      echo "  --no-build         Skip the build step"
      echo "  --port PORT        Specify a custom port (default: 3069)"
      echo "  --debug            Enable debug mode (default)"
      echo "  --no-debug         Disable debug mode"
      echo "  --logs             View the latest debug logs"
      echo "  --tail             Continuously watch the debug logs"
      echo "  --npx              Run the npx version (1.0.9) instead of local build"
      echo "  --help             Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $key"
      echo "Use --help for usage information"
      exit 1
      ;;
  esac
done

# If logs view is requested, show logs and exit
if [ "$VIEW_LOGS" = true ]; then
  echo "Showing last 50 lines of debug logs:"
  cat "$LOG_PATH" | tail -n 50
  exit 0
fi

# If tail logs is requested, continuously watch logs and exit
if [ "$TAIL_LOGS" = true ]; then
  echo "Continuously watching debug logs (Ctrl+C to exit):"
  tail -f "$LOG_PATH"
  exit 0
fi

echo "Setting environment variables for ElizaOS MCP..."

# Core ElizaOS environment variables
export ELIZAOS_SERVER_URL="http://localhost:3000"
export ELIZAOS_USER_ID="ad64a76a-0e09-0899-b8f8-492d6aea4118"
export ELIZAOS_WORLD_ID="c930b151-dcfb-41c5-96af-550ffea7023c"

# Agent configuration
export ELIZAOS_AGENT_ID="85e9fa66-6f8c-0f18-922c-d6c962e21e18"
# ROOM_ID must be identical to AGENT_ID for ElizaOS
export ELIZAOS_ROOM_ID="85e9fa66-6f8c-0f18-922c-d6c962e21e18"

# Set port for the MCP server
export PORT="$PORT"

# Optional: Set custom timeouts (in milliseconds)
export ELIZAOS_CONNECTION_TIMEOUT="120000"  # Default in client is 120000ms (2 minutes)
export ELIZAOS_RESPONSE_TIMEOUT="90000"     # Default in client is 90000ms (1.5 minutes)

# Set debug mode if enabled
if [ -n "$DEBUG" ]; then
  export DEBUG="$DEBUG"
  echo "Debug mode: ENABLED (logs at $LOG_PATH)"
else
  echo "Debug mode: DISABLED"
fi

# Set environment variables to suppress warnings
export NODE_ENV="production"
export MCP_DISABLE_PINGS="true"

echo "Configuration:"
echo "ELIZAOS_SERVER_URL: $ELIZAOS_SERVER_URL"
echo "ELIZAOS_USER_ID: $ELIZAOS_USER_ID"
echo "ELIZAOS_WORLD_ID: $ELIZAOS_WORLD_ID"
echo "ELIZAOS_AGENT_ID: $ELIZAOS_AGENT_ID"
echo "ELIZAOS_ROOM_ID: $ELIZAOS_ROOM_ID"
echo "PORT: $PORT"
echo "ELIZAOS_CONNECTION_TIMEOUT: $ELIZAOS_CONNECTION_TIMEOUT"
echo "ELIZAOS_RESPONSE_TIMEOUT: $ELIZAOS_RESPONSE_TIMEOUT"
echo "Version: $VERSION"

# Build if requested
if [ "$BUILD" = true ] && [ "$VERSION" = "local" ]; then
  echo "Building the ElizaOS MCP server..."
  npm run build
else
  echo "Skipping build step..."
fi

echo "Starting the ElizaOS MCP server..."

# Run the appropriate version
if [ "$VERSION" = "npx" ]; then
  echo "Running npx version (1.0.9)..."
  npx -y society-elizaos-mcp@1.0.9
else
  echo "Running local build..."
  # Run the local build in stdio mode
  node ../dist/index.js
fi

echo "ElizaOS MCP server has been stopped." 