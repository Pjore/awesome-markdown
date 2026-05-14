#!/usr/bin/env bash
# post-create.sh — runs once after devcontainer is created
set -euo pipefail

# Make scripts executable
chmod +x scripts/load-credentials.sh

# Install agent-browser (arch-aware)
# arm64: no Chrome for Testing builds — use Playwright Chromium instead
# amd64: use agent-browser's bundled Chromium
npm install -g agent-browser

ARCH=$(dpkg --print-architecture)
echo "Installing agent-browser for arch: ${ARCH}"

if [[ "${ARCH}" == "arm64" ]]; then
  npx playwright install chromium --with-deps
  npm install -g playwright
  CHROMIUM_PATH=$(NODE_PATH=$(npm root -g) node -e "const p = require('playwright'); console.log(p.chromium.executablePath())")
  echo "export AGENT_BROWSER_EXECUTABLE_PATH=${CHROMIUM_PATH}" >> ~/.bashrc
  echo "export AGENT_BROWSER_EXECUTABLE_PATH=${CHROMIUM_PATH}" >> ~/.zshrc
  echo "✓ agent-browser configured with Playwright Chromium (ARM64)"
else
  agent-browser install --with-deps
  echo "✓ agent-browser installed with bundled Chromium (amd64)"
fi

echo "✓ Post-create complete"
