#!/usr/bin/env bash
# E2E Tests via Docker
#
# Fallback for NixOS or environments where local Playwright doesn't work.
# Runs Playwright in a Docker container and connects to it.
#
# Usage:
#   ./scripts/e2e-docker.sh                    # Run extension E2E tests
#   ./scripts/e2e-docker.sh pnpm test:e2e      # Run standard E2E tests
#   ./scripts/e2e-docker.sh --headed           # Run with browser visible (requires X11)
#
# Requirements:
#   - Docker Engine or Docker Desktop
#   - Port 3000 available

set -e

# Configuration
PLAYWRIGHT_VERSION="${PLAYWRIGHT_VERSION:-1.52.0}"
CONTAINER_NAME="proso-playwright-server"
PLAYWRIGHT_PORT="${PLAYWRIGHT_PORT:-3000}"
PLAYWRIGHT_IMAGE="mcr.microsoft.com/playwright:v${PLAYWRIGHT_VERSION}-noble"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is available
if ! command -v docker &> /dev/null; then
  log_error "Docker is not installed or not in PATH"
  echo ""
  echo "Install Docker:"
  echo "  - NixOS: Add 'virtualisation.docker.enable = true;' to configuration.nix"
  echo "  - Ubuntu: sudo apt install docker.io"
  echo "  - macOS: brew install --cask docker"
  exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
  log_error "Docker daemon is not running"
  echo ""
  echo "Start Docker:"
  echo "  - systemctl start docker"
  echo "  - Or start Docker Desktop"
  exit 1
fi

# Stop any existing container
cleanup() {
  if docker ps -q -f name="${CONTAINER_NAME}" | grep -q .; then
    log_info "Stopping existing Playwright server container..."
    docker stop "${CONTAINER_NAME}" > /dev/null 2>&1 || true
  fi
}

# Cleanup on script exit
trap cleanup EXIT

# Check if container already running
if docker ps -q -f name="${CONTAINER_NAME}" | grep -q .; then
  log_info "Playwright server already running on port ${PLAYWRIGHT_PORT}"
else
  log_info "Starting Playwright server container..."
  log_info "Image: ${PLAYWRIGHT_IMAGE}"
  
  # Pull image if not present
  if ! docker image inspect "${PLAYWRIGHT_IMAGE}" > /dev/null 2>&1; then
    log_info "Pulling Playwright image (this may take a few minutes)..."
    docker pull "${PLAYWRIGHT_IMAGE}"
  fi

  # Start container
  docker run -d \
    --name "${CONTAINER_NAME}" \
    --rm \
    --init \
    --ipc=host \
    -p "${PLAYWRIGHT_PORT}:3000" \
    "${PLAYWRIGHT_IMAGE}" \
    /bin/sh -c "npx -y playwright@${PLAYWRIGHT_VERSION} run-server --port 3000 --host 0.0.0.0"

  # Wait for server to be ready
  log_info "Waiting for Playwright server to be ready..."
  for i in {1..30}; do
    if curl -s "http://127.0.0.1:${PLAYWRIGHT_PORT}/" > /dev/null 2>&1; then
      log_info "Playwright server is ready"
      break
    fi
    if [ $i -eq 30 ]; then
      log_error "Playwright server failed to start within 30 seconds"
      docker logs "${CONTAINER_NAME}"
      exit 1
    fi
    sleep 1
  done
fi

# Set environment variable for Playwright to connect to Docker
export PW_TEST_CONNECT_WS_ENDPOINT="ws://127.0.0.1:${PLAYWRIGHT_PORT}/"
log_info "Using Playwright server at ${PW_TEST_CONNECT_WS_ENDPOINT}"

# Determine test command
if [ $# -eq 0 ]; then
  # Default: run extension E2E tests
  TEST_CMD="pnpm test:e2e:ext"
else
  # Use provided command
  TEST_CMD="$*"
fi

log_info "Running: ${TEST_CMD}"
echo ""

# Run tests
eval "${TEST_CMD}"
TEST_EXIT_CODE=$?

# Report result
echo ""
if [ $TEST_EXIT_CODE -eq 0 ]; then
  log_info "Tests completed successfully"
else
  log_error "Tests failed with exit code ${TEST_EXIT_CODE}"
fi

exit $TEST_EXIT_CODE
