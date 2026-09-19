#!/bin/bash

# React Setup Verification Script
# Checks that all React migration setup is correct

echo "🔍 Verifying React Migration Setup..."
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

ERRORS=0

# Test 1: Check dependencies installed
echo "Test 1: Checking dependencies..."
if npm list react react-dom vite @vitejs/plugin-react concurrently > /dev/null 2>&1; then
  echo -e "${GREEN}✅ All dependencies installed${NC}"
else
  echo -e "${RED}❌ Missing dependencies${NC}"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Test 2: Check vite.config.js exists
echo "Test 2: Checking vite.config.js..."
if [ -f "vite.config.js" ]; then
  echo -e "${GREEN}✅ vite.config.js exists${NC}"
else
  echo -e "${RED}❌ vite.config.js missing${NC}"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Test 3: Check react-app.jsx exists
echo "Test 3: Checking react-app.jsx..."
if [ -f "src/ui/react-app.jsx" ]; then
  echo -e "${GREEN}✅ react-app.jsx exists${NC}"
else
  echo -e "${RED}❌ react-app.jsx missing${NC}"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Test 4: Check package.json has new scripts
echo "Test 4: Checking package.json scripts..."
if grep -q '"dev:ui": "vite"' package.json; then
  echo -e "${GREEN}✅ package.json has dev:ui script${NC}"
else
  echo -e "${RED}❌ package.json missing dev:ui script${NC}"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Test 5: Check index.html has React script tag
echo "Test 5: Checking index.html..."
if grep -q 'react-app.jsx' src/ui/index.html; then
  echo -e "${GREEN}✅ index.html has React script tag${NC}"
else
  echo -e "${RED}❌ index.html missing React script tag${NC}"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Test 6: Check ports availability
# Uses node's own net module rather than `lsof` - `lsof` isn't installed by
# default in Git Bash on Windows, which silently makes `! lsof ...` report
# "available" for every port regardless of what's actually listening.
echo "Test 6: Checking ports availability..."

check_port() {
  local port="$1"
  local label="$2"
  if node -e "
    const net = require('net');
    const server = net.createServer();
    server.once('error', () => process.exit(1));
    server.once('listening', () => server.close(() => process.exit(0)));
    server.listen($port, '127.0.0.1');
  " >/dev/null 2>&1; then
    echo -e "${GREEN}✅ Port $port ($label) available${NC}"
  else
    echo -e "${YELLOW}⚠️  Port $port already in use ($label server running?)${NC}"
  fi
}

check_port 9000 "backend"
check_port 3456 "Vite"
echo ""

# Test 7: Verify file structure
echo "Test 7: Verifying project structure..."
MISSING_DIRS=""

if [ ! -d "src/ui/helpers" ]; then
  MISSING_DIRS="$MISSING_DIRS src/ui/helpers"
fi

if [ ! -d "src/server" ]; then
  MISSING_DIRS="$MISSING_DIRS src/server"
fi

if [ -z "$MISSING_DIRS" ]; then
  echo -e "${GREEN}✅ Project structure correct${NC}"
else
  echo -e "${RED}❌ Missing directories: $MISSING_DIRS${NC}"
  ERRORS=$((ERRORS + 1))
fi
echo ""

# Summary
echo "================================"
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}✅ All checks passed!${NC}"
  echo ""
  echo "Next steps:"
  echo "  1. Run: npm run dev"
  echo "  2. Open: http://localhost:3456"
  echo "  3. Look for: Blue 'React Migration' box"
  echo ""
  echo "See README.md's 'React Development Scripts' section for the full workflow."
else
  echo -e "${RED}❌ $ERRORS error(s) found${NC}"
  echo ""
  echo "Please fix the errors above before proceeding."
  echo "See README.md's 'Quick Start' and 'Requirements' sections for setup instructions."
fi
echo "================================"
