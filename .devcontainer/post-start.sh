#!/bin/bash
set -e

# Load credentials from .env
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [ -f "${SCRIPT_DIR}/scripts/load-credentials.sh" ]; then
    source "${SCRIPT_DIR}/scripts/load-credentials.sh"
    echo ""
fi

echo "Configuring git user from GitHub CLI..."

# Check if gh is available and authenticated
if ! command -v gh &> /dev/null || ! gh auth status &> /dev/null; then
    echo "⚠ GitHub CLI not available or not authenticated, skipping git config"
    exit 0
fi

# Get user info from GitHub
GH_USER=$(gh api user 2>/dev/null)
if [ -z "$GH_USER" ]; then
    echo "⚠ Could not retrieve GitHub user info"
    exit 0
fi

# Extract and set user name
GH_NAME=$(echo "$GH_USER" | jq -r '.name // .login')
if [ -n "$GH_NAME" ] && [ "$GH_NAME" != "null" ]; then
    git config --global user.name "$GH_NAME"
    echo "✓ Git user.name set to: $GH_NAME"
fi

# Extract and set email
GH_EMAIL=$(echo "$GH_USER" | jq -r '.email // empty')
if [ -n "$GH_EMAIL" ] && [ "$GH_EMAIL" != "null" ]; then
    git config --global user.email "$GH_EMAIL"
    echo "✓ Git user.email set to: $GH_EMAIL"
fi

# Configure git to use HTTPS instead of SSH in the container
# This allows SSH to work on the host while using HTTPS with gh auth in the container
git config --global url."https://github.com/".insteadOf git@github.com:
git config --global credential.helper '!gh auth git-credential'
echo "✓ Git configured to use HTTPS with GitHub CLI authentication"

echo ""
echo "✓ Post-start setup complete!"

