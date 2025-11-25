#!/bin/bash

# Validate that frontend and backend ports are aligned
# This prevents CORS issues from port mismatches

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🔍 Validating port configuration..."

# Extract frontend port from vite.config.ts
FRONTEND_PORT=$(grep -A 5 "server:" ../frontend/vite.config.ts | grep "port:" | sed 's/.*port: \([0-9]*\).*/\1/')

# Extract FRONTEND_URL from backend .env
if [ -f ../backend/.env ]; then
    BACKEND_FRONTEND_URL=$(grep "^FRONTEND_URL=" ../backend/.env | cut -d'=' -f2)
    EXPECTED_FRONTEND_URL="http://localhost:$FRONTEND_PORT"

    if [ "$BACKEND_FRONTEND_URL" != "$EXPECTED_FRONTEND_URL" ]; then
        echo -e "${RED}❌ PORT MISMATCH DETECTED!${NC}"
        echo -e "   Frontend port (vite.config.ts): ${YELLOW}$FRONTEND_PORT${NC}"
        echo -e "   Backend FRONTEND_URL (.env):    ${YELLOW}$BACKEND_FRONTEND_URL${NC}"
        echo -e "   Expected:                        ${GREEN}$EXPECTED_FRONTEND_URL${NC}"
        echo ""
        echo -e "${YELLOW}To fix: Update backend/.env to:${NC}"
        echo -e "   ${GREEN}FRONTEND_URL=$EXPECTED_FRONTEND_URL${NC}"
        exit 1
    else
        echo -e "${GREEN}✅ Port configuration is correct!${NC}"
        echo -e "   Frontend: http://localhost:$FRONTEND_PORT"
        echo -e "   Backend expects: $BACKEND_FRONTEND_URL"
    fi
else
    echo -e "${RED}❌ backend/.env file not found${NC}"
    exit 1
fi
