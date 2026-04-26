# Makefile — top-level shortcuts for common dev operations.
#
# Run from the repo root. Self-documenting: `make` lists every target.

.PHONY: help install test typecheck lint status orchestrator-test orchestrator-typecheck \
        mcp-install mcp-list cowork-list prs prs-merged

help:  ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?##' $(MAKEFILE_LIST) \
	  | awk 'BEGIN {FS = ":.*?##"} {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

install:  ## Install all subproject dependencies
	cd subagent-orchestrator && npm ci

test: orchestrator-test  ## Run all tests across all subprojects

typecheck: orchestrator-typecheck  ## Typecheck all TS subprojects

orchestrator-test:  ## Run subagent-orchestrator vitest suite
	cd subagent-orchestrator && npm test

orchestrator-typecheck:  ## TS strict-typecheck the orchestrator
	cd subagent-orchestrator && npm run typecheck

lint:  ## Lint everything (placeholder; biome wired in subagent-orchestrator)
	cd subagent-orchestrator && npm run lint || echo "(lint not configured for all subprojects)"

status:  ## Show orchestrator status (open PRs, recent dispatches, costs)
	bash subagent-orchestrator/scripts/status.sh

mcp-install:  ## Install Tier 1 MCP servers into ~/.claude/settings.json (idempotent)
	bash subagent-mcp-servers/install.sh

mcp-list:  ## List currently configured MCP servers in ~/.claude/settings.json
	@jq -r '.mcpServers | keys[]' ~/.claude/settings.json 2>/dev/null \
	  || echo "(no mcpServers configured or jq not installed)"

cowork-list:  ## List the 16 cowork plugin docs
	@ls -1 subagent-cowork/*.md | grep -v "README.md" | sed 's|.*/||; s|.md$$||'

prs:  ## List open PRs
	@gh pr list --state open --json number,title,statusCheckRollup \
	  --jq '.[] | "PR #\(.number) | \([.statusCheckRollup[].status // "?"] | join(",")) | \(.title)"'

prs-merged:  ## Count merged PRs (this session ≈ 27 + ongoing)
	@gh pr list --state merged --limit 200 --json number --jq '. | length'
