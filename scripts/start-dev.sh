#!/bin/bash

# Koordi Development Startup Script
# Starts backend, frontend, and marketing site in parallel

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 Starting Koordi Development Environment"
echo "==========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if ports are available
check_port() {
    if lsof -Pi :$1 -sTCP:LISTEN -t >/dev/null 2>&1; then
        echo -e "${RED}⚠️  Port $1 is already in use${NC}"
        return 1
    fi
    return 0
}

echo "Checking port availability..."
PORTS_OK=true

if ! check_port 3000; then
    echo "   Backend port 3000 in use"
    PORTS_OK=false
fi

if ! check_port 5173; then
    echo "   Frontend port 5173 in use"
    PORTS_OK=false
fi

if ! check_port 8080; then
    echo "   Marketing site port 8080 in use"
    PORTS_OK=false
fi

if [ "$PORTS_OK" = false ]; then
    echo ""
    echo -e "${YELLOW}Some ports are in use. Continue anyway? (y/n)${NC}"
    read -r response
    if [[ ! "$response" =~ ^[Yy]$ ]]; then
        echo "Exiting."
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}Starting services...${NC}"
echo ""

# Start Backend (port 3000)
echo -e "${BLUE}[Backend]${NC} Starting on http://localhost:3000"
cd "$PROJECT_ROOT/backend"
npm run dev &
BACKEND_PID=$!

# Start Frontend (port 5173)
echo -e "${BLUE}[Frontend]${NC} Starting on http://localhost:5173"
cd "$PROJECT_ROOT/frontend"
npm run dev &
FRONTEND_PID=$!

# Start Marketing Site (port 8080) using Python's built-in server
echo -e "${BLUE}[Marketing]${NC} Starting on http://localhost:8080"
cd "$PROJECT_ROOT/marketing-site"
python3 -m http.server 8080 &
MARKETING_PID=$!

# Return to project root
cd "$PROJECT_ROOT"

echo ""
echo "==========================================="
echo -e "${GREEN}✅ All services starting!${NC}"
echo ""
echo "Services:"
echo -e "  ${BLUE}Backend API:${NC}     http://localhost:3000"
echo -e "  ${BLUE}Frontend App:${NC}    http://localhost:5173"
echo -e "  ${BLUE}Marketing Site:${NC}  http://localhost:8080"
echo ""
echo "Process IDs:"
echo "  Backend:   $BACKEND_PID"
echo "  Frontend:  $FRONTEND_PID"
echo "  Marketing: $MARKETING_PID"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Trap Ctrl+C to kill all background processes
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down services...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    kill $MARKETING_PID 2>/dev/null
    echo -e "${GREEN}All services stopped.${NC}"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Wait for all background processes
wait
