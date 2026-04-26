#!/usr/bin/env bash
# status.sh — one-glance orchestrator state.
# Prints: open PRs in current repo + recent dispatches from local DB +
# auto-review cost summary. No mutations.

set -euo pipefail

# Defaults; override via env.
DB="${SUBAGENT_ORCHESTRATOR_DB:-${HOME}/.claude/orchestrator.db}"
REPO="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || echo "?")}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
dim()  { printf '\033[2m%s\033[0m\n' "$*"; }

bold "## subagent-orchestrator status"
dim  "$(date -u +%Y-%m-%dT%H:%M:%SZ)  ·  repo=${REPO}  ·  db=${DB}"
echo

bold "Open PRs"
if command -v gh >/dev/null 2>&1; then
  gh pr list --state open \
    --json number,title,statusCheckRollup,isDraft \
    --jq '.[] | "  PR #\(.number) [\(if .isDraft then "DRAFT" else "READY" end)] | \([.statusCheckRollup[0].status // "no-check"] | join(",")) | \(.title)"' \
    2>/dev/null || echo "  (gh failed; not in a repo? not authenticated?)"
else
  echo "  (gh not installed)"
fi
echo

bold "Recent dispatches (last 10)"
if command -v sqlite3 >/dev/null 2>&1 && [ -f "${DB}" ]; then
  sqlite3 -separator ' | ' "${DB}" "
    SELECT
      task_id,
      disposition,
      status,
      printf('\$%.2f', COALESCE(cost_usd_estimate, 0)),
      substr(dispatched_at, 1, 19)
    FROM dispatch_log
    ORDER BY dispatched_at DESC
    LIMIT 10
  " 2>/dev/null | sed 's/^/  /' || echo "  (no dispatches yet)"
else
  echo "  (no DB at ${DB} or sqlite3 not installed)"
fi
echo

bold "Recent auto-review cost (last 10 PRs in current repo)"
if command -v gh >/dev/null 2>&1; then
  # Pull last 10 closed PRs and sum any claude-review run costs they have
  gh run list --workflow="Claude Code Review" --limit 10 \
    --json conclusion,displayTitle,createdAt,databaseId \
    --jq '.[] | "  \(.createdAt | split("T") | .[0])  \(.conclusion // "running"|.[0:7])  \(.displayTitle | .[0:60])"' \
    2>/dev/null || echo "  (no recent runs)"
else
  echo "  (gh not installed)"
fi
echo

bold "Total cost (sqlite sum)"
if command -v sqlite3 >/dev/null 2>&1 && [ -f "${DB}" ]; then
  TOTAL=$(sqlite3 "${DB}" "SELECT printf('\$%.2f', COALESCE(SUM(cost_usd_estimate), 0)) FROM dispatch_log" 2>/dev/null || echo '$0.00')
  echo "  ${TOTAL} across $(sqlite3 "${DB}" "SELECT COUNT(*) FROM dispatch_log" 2>/dev/null || echo 0) dispatches"
else
  echo "  (no DB)"
fi
