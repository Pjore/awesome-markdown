#!/usr/bin/env bash
# load-credentials.sh — Source environment variables from .env
# Usage: source scripts/load-credentials.sh
set -euo pipefail

ENV_FILE="${1:-.env}"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "✗ ${ENV_FILE} not found. Copy .env.example to .env and fill in values."
  return 1 2>/dev/null || exit 1
fi

BEFORE_VARS=$(env | cut -d= -f1 | sort)

set -a
source "${ENV_FILE}"
set +a

AFTER_VARS=$(env | cut -d= -f1 | sort)
LOADED_KEYS=$(comm -13 <(echo "$BEFORE_VARS") <(echo "$AFTER_VARS"))

echo "✓ Credentials loaded from ${ENV_FILE}"
if [[ -n "$LOADED_KEYS" ]]; then
  echo "  Keys: ${LOADED_KEYS//$'\n'/, }"
fi
