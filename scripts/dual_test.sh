#!/bin/bash

# Society ElizaOS MCP Dual Test Script
# Tests both local and NPX versions in parallel, with logs

set -e

echo "===== SOCIETY ELIZAOS MCP DUAL TEST ====="
echo "This script will test both the local build and the NPX version in parallel"

LOGS_DIR="/tmp/elizaos-mcp-logs"
LOCAL_LOG="$LOGS_DIR/local.log"
NPX_LOG="$LOGS_DIR/npx.log"

# Create logs directory
mkdir -p "$LOGS_DIR"

# First, build the local version
echo "Building local version..."
npm run build

# Clear existing logs
> "$LOCAL_LOG"
> "$NPX_LOG"

echo "Starting tests..."
echo "Logs will be saved to $LOGS_DIR"

# Start a local test in background
echo "Starting local version (PORT 3069)..."
NODE_ENV=production MCP_DISABLE_PINGS=true ./mcp_run.sh --debug > "$LOCAL_LOG" 2>&1 &
LOCAL_PID=$!

# Start NPX version in background 
echo "Starting NPX version (PORT 3099)..."
PREV_DIR="$PWD"
cd /tmp # Run in a different directory to avoid any accidental local file usage
NODE_ENV=production MCP_DISABLE_PINGS=true PORT=3099 npx -y society-elizaos-mcp@1.0.9 > "$NPX_LOG" 2>&1 &
NPX_PID=$!
cd "$PREV_DIR"

echo "Both servers are running!"
echo "LOCAL PID: $LOCAL_PID (Port 3069)"
echo "NPX PID: $NPX_PID (Port 3099)"
echo "" 

# Function to check log file for successful initialization
check_log_for_success() {
  local log_file=$1
  local max_time=30
  local start_time=$(date +%s)
  local current_time
  
  echo "Waiting for startup in $log_file..."
  
  while true; do
    current_time=$(date +%s)
    if (( current_time - start_time > max_time )); then
      echo "Timeout waiting for successful startup in $log_file"
      return 1
    fi
    
    if grep -q "MCP server connected to transport" "$log_file" || grep -q "Heartbeat - MCP server still running" "$log_file"; then
      echo "✅ Success: MCP server successfully started according to $log_file"
      return 0
    fi
    
    sleep 1
  done
}

# Monitor the MCP server debug log for both versions
check_log_for_success "$LOCAL_LOG"
LOCAL_STATUS=$?

check_log_for_success "$NPX_LOG" 
NPX_STATUS=$?

echo ""
echo "Startup Status:"
echo "Local: $([ $LOCAL_STATUS -eq 0 ] && echo '✅ SUCCESS' || echo '❌ FAILED')"
echo "NPX: $([ $NPX_STATUS -eq 0 ] && echo '✅ SUCCESS' || echo '❌ FAILED')"
echo ""

# Show logs from both versions
echo "=== LOCAL LOG TAIL (Port 3069) ==="
tail -n 20 "$LOCAL_LOG"
echo ""
echo "=== NPX LOG TAIL (Port 3099) ==="
tail -n 20 "$NPX_LOG"
echo ""

# Keep running until user wants to stop
echo "Both servers are running in background. Press Enter to stop them and exit."
read

# Kill both processes
kill $LOCAL_PID 2>/dev/null || true
kill $NPX_PID 2>/dev/null || true

echo "Both servers have been stopped."
echo "Full logs are available at:"
echo "  - Local: $LOCAL_LOG"
echo "  - NPX: $NPX_LOG" 