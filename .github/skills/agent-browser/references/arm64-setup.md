# ARM64 Setup

Chrome for Testing has no ARM64 builds. On `aarch64` machines (e.g. Coder workspaces), use Playwright's bundled Chromium instead.

## One-time Setup

```bash
# 1. Install system library dependencies
sudo apt-get install -y -q \
  libnspr4 libnss3 \
  libatk1.0-0t64 libatk-bridge2.0-0t64 \
  libcups2t64 libxkbcommon0 libatspi2.0-0t64 \
  libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
  libgbm1 libcairo2 libpango-1.0-0 libasound2t64 2>/dev/null || true

# 2. Download Playwright's ARM64 Chromium (~290 MB)
npm install -g playwright
npx playwright install chromium

# 3. Create a stable symlink to the downloaded binary
CHROMIUM_BINARY=$(ls -d ~/.cache/ms-playwright/chromium-*/chrome-linux/chrome 2>/dev/null | tail -1)
mkdir -p ~/.local/bin
ln -sfn "$CHROMIUM_BINARY" ~/.local/bin/playwright-chromium

# 4. Point agent-browser at the Playwright Chromium binary
mkdir -p ~/.agent-browser
echo '{"executablePath": "/home/coder/.local/bin/playwright-chromium"}' > ~/.agent-browser/config.json
```

## Container Rebuild Behaviour

The container filesystem resets on rebuild but the home volume (`/home/coder`) persists:

- **Re-run after every rebuild:** step 1 (apt system deps)
- **Run only once:** steps 2–4 (Playwright Chromium download, symlink, config)

## Verify

```bash
agent-browser open https://example.com && agent-browser snapshot
```
