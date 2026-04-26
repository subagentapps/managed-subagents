#!/usr/bin/env bash
# install.sh — idempotently install Tier 1 MCP servers into ~/.claude/settings.json
#
# What it does:
# - Backs up settings.json with a timestamped suffix
# - Merges in the 6 Tier 1 servers (github, filesystem, memory,
#   sequential-thinking, redis, claude-trace) under .mcpServers
# - Does NOT touch any other key in settings.json
# - Re-runnable: subsequent runs overwrite the same 6 entries with the
#   canonical config, leave others alone
#
# Requirements: jq, npx (for the actual server runs at session time).
# Verify with: jq -r '.mcpServers | keys' ~/.claude/settings.json

set -euo pipefail

SETTINGS="${HOME}/.claude/settings.json"
TS=$(date -u +%Y%m%d-%H%M%SZ)
BACKUP="${SETTINGS}.bak.${TS}-mcp-tier1"
TMP=$(mktemp)
trap 'rm -f "${TMP}"' EXIT

if [ ! -f "${SETTINGS}" ]; then
  echo "ERROR: ${SETTINGS} does not exist." >&2
  echo "       Claude Code stores its config there; install/launch Claude Code first." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required. brew install jq" >&2
  exit 1
fi

cp "${SETTINGS}" "${BACKUP}"
echo "Backed up settings to ${BACKUP}"

REPO_ROOT="${REPO_ROOT:-${HOME}/claude-projects}"

jq --arg root "${REPO_ROOT}" '.mcpServers = (.mcpServers // {}) + {
  "github": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-github"]
  },
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", $root]
  },
  "memory": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-memory"]
  },
  "sequential-thinking": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-sequential-thinking"]
  },
  "redis": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-redis", "redis://localhost:6379"]
  },
  "claude-trace": {
    "command": "npx",
    "args": ["-y", "@anthropic-ai/claude-trace"]
  }
}' "${SETTINGS}" > "${TMP}"

# Validate before swap.
jq . "${TMP}" > /dev/null

mv "${TMP}" "${SETTINGS}"
echo "Installed 6 Tier 1 MCP servers."
echo "Verify with: jq -r '.mcpServers | keys' ${SETTINGS}"
echo
echo "Notes:"
echo " - github: needs GITHUB_PERSONAL_ACCESS_TOKEN in env or via MCP env config"
echo " - redis: defaults to localhost:6379. For Upstash, edit args[2] to rediss://..."
echo " - filesystem: scoped to ${REPO_ROOT}; override with REPO_ROOT env var"
echo
echo "Restart Claude Code for the new MCP servers to register."
