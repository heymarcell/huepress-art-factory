#!/bin/bash
# Start HuePress Art Factory with Vectorizer API
# Usage: ./start-dev.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VECTORIZER_DIR="$SCRIPT_DIR/../vectorizerai_api"
ART_FACTORY_DIR="$SCRIPT_DIR"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Starting HuePress Art Factory with Vectorizer API...${NC}"

# Cleanup on exit
cleanup() {
    echo -e "\n${BLUE}Shutting down...${NC}"
    pkill -f "vectorizer_api.main:app" 2>/dev/null || true
    pkill -f "electron-forge" 2>/dev/null || true
    exit 0
}
trap cleanup SIGINT SIGTERM

# Start Vectorizer API in background
echo -e "${GREEN}Starting Vectorizer API on port 8000...${NC}"
(cd "$VECTORIZER_DIR" && uv run python -m uvicorn vectorizer_api.main:app --host 0.0.0.0 --port 8000) &

# Wait a moment for API to start
# Wait for API to start (up to 30 seconds)
echo -e "${GREEN}Waiting for Vectorizer API to be ready...${NC}"
count=0
while ! nc -z localhost 8000; do   
  sleep 1
  count=$((count+1))
  if [ $count -ge 30 ]; then
      echo -e "${BLUE}Timeout waiting for API! Validating logs...${NC}"
      break
  fi
done
echo -e "${GREEN}Vectorizer API is ready!${NC}"

# Start Art Factory in foreground (Electron needs foreground for window)
echo -e "${GREEN}Starting Art Factory...${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}Press Ctrl+C to stop both services.${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

cd "$ART_FACTORY_DIR"
npm start
