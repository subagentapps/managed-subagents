# CLI_COWORK_PLAN.md

Generated 2026-04-26. Substantively rewritten 2026-04-27 after deeply re-reading [`code.claude.com/docs/en/claude-code-on-the-web.md`](https://code.claude.com/docs/en/claude-code-on-the-web.md). Replaces `INFRASTRUCTURE_PLAN.draft.md`. Pairs with `CLAUDE_CLI_MAX_PLAN_AGENT_AS_AUTONOMOUS_WEB_PR_ORCHESTRATOR_PLAN.md` (the orchestrator side).

> **STATUS (2026-04-27):** Option C′ (Cloudflare-canonical with **Custom-allowlist + Neon hybrid**) settled as the default. The web allowlist is **user-extensible via Custom mode** — earlier drafts of this doc treated it as fixed; that was wrong. Open decisions §8 closed.

---

## 1. The three runtimes

| Runtime | Where it runs | Persistent state | Network reach |
|---|---|---|---|
| **CLI** (`claude` on MacBook) | `/Users/alexzh/`, full filesystem reach | Local files; `~/.claude/projects/<encoded-cwd>/` for sessions; user MCP servers via stdio | Open — anything you can `curl` from the laptop |
| **Cowork** (macOS desktop app) | Local on macOS, operates via Anthropic's agent infrastructure | Cowork-shared folders (user-picked); MCP connectors registered in Cowork settings | Open — same as a normal app, plus Cowork's connector network |
| **Web** (`claude.ai/code`) | Anthropic-managed VM (4 vCPU / 16 GB RAM / 30 GB disk) with PostgreSQL 16 + Redis 7.0 pre-installed | Ephemeral container; persists via GitHub | Configurable per environment: **None / Trusted / Full / Custom** |

The web's network reach is **per-environment** (not a single global allowlist). `claude --remote` uses your default environment; you can have multiple environments with different access levels.

---

## 2. Web environment access levels

From the doc's "Network access" section:

| Level | What it allows | Use when |
|---|---|---|
| **None** | No outbound network | Reproducible sandbox; no installs |
| **Trusted** (default) | The published default allowlist (Anthropic services, GitHub, package registries, cloud SDKs). See doc for full list | Most workflows; covers the package-install case |
| **Full** | Any domain | Maximum reach; minimum security |
| **Custom** | Your own allowlist, **optionally** including the defaults | **The unlock.** Add `*.neon.tech`, `*.upstash.io`, your own subdomain — anything you control |

**The Custom level is the load-bearing finding.** It rewrites this entire plan: previously every "web parity" architecture had to route through `*.amazonaws.com` (the only allowed PG-class endpoint by default). With Custom, **any DB endpoint you can name** becomes web-reachable — Neon, Upstash Redis, Cloudflare Workers on a custom domain, anything.

### Custom allowlist UI

Per the doc:
> *"To allow domains that aren't in the Trusted list, select **Custom** in the environment's network access settings. An **Allowed domains** field appears. Enter one domain per line. Use `*.` for wildcard subdomain matching. Check **Also include default list of common package managers** to keep the Trusted domains alongside your custom entries."*

So you can keep the package-registry defaults AND add your DB hosts. No either/or.

---

## 3. The four viable architectures (rewritten)

### Option A — AWS-canonical (Trusted-allowlist native)

```
   CLI ──┐
          ├──► AWS RDS Postgres + ElastiCache Redis  ◄─── Web (no Custom needed)
   Cowork ┘
```

- All three runtimes connect via `*.amazonaws.com` (already in Trusted list)
- **No Custom-allowlist setup needed** — works out of the box
- **Cost:** ~$25–50/mo small dev, ~$200–500/mo production
- **Tradeoff:** AWS, not the Cloudflare-native estate the user already has (`agentknowledgeworkers.com`, `jadecli.app`, `agentbloggers.com` all on Cloudflare)

### Option B — AlloyDB on GCP (Trusted-allowlist via `*.googleapis.com`)

```
   CLI ──┐
          ├──► AlloyDB + Memorystore Redis  ◄─── Web (via Auth Proxy on *.googleapis.com)
   Cowork ┘
```

- AlloyDB Auth Proxy connects via `*.googleapis.com` (in Trusted list)
- Best Postgres-on-GCP performance per dollar
- **Open verification:** the AlloyDB Auth Proxy needs to actually be installable in the cloud sandbox (via setup script: `apt install -y alloydb-auth-proxy` or equivalent). Untested.
- **Cost:** ~$60–80/mo small

### Option C′ — Cloudflare-canonical + Neon hybrid (the new default)

```
                                                    ┌── Custom allowlist ──┐
   CLI ──┐                                          │  *.neon.tech         │
          ├──► Cloudflare D1 + R2 + KV  +  Neon PG ─┤  *.upstash.io        │
   Cowork ┘                                          │  db.managedsubagents │
                                                    └─────────┬────────────┘
                                                              │ web reaches all
                                                              ▼
                                                       Web cloud session
                                                       (uses preinstalled
                                                        Postgres 16 / Redis 7
                                                        as fast cache; reads
                                                        canonical from Neon)
```

**Settled default (2026-04-27).** The setup:

| Layer | Where |
|---|---|
| **Canonical SQL warehouse** | **Neon Postgres 18** — branching enables one branch per crawler experiment |
| **Hot blob storage + raw HTML/markdown** | **Cloudflare R2** — for the crawler's `subagent-raw/` content-addressed bodies |
| **Small hot config / KV lookups** | **Cloudflare KV** — for `~~category` resolution cache, run state, etc. |
| **Caching / queue** | **Cloudflare Workers Queues** + Upstash Redis (canonical) OR local sandbox Redis 7.0 (web sessions) |
| **Web parity** | **Custom-allowlist environment** with `*.neon.tech`, `*.upstash.io`, `*.r2.cloudflarestorage.com`, `*.modelcontextprotocol.io` (default), and any custom subdomain we publish |
| **Web hot start** | The cloud sandbox already has Postgres 16 + Redis 7.0 pre-installed; we use them as **read-through cache**, NOT as canonical store. Setup script populates them at session-start from Neon over the Custom allowlist. |

**Setup script** lives in the environment (Anthropic-managed, configured in the web UI):

```bash
#!/bin/bash
# Cloud session setup — runs once per environment, then cached.
# See "Setup scripts" + "Environment caching" sections of the doc.

# Install psql + redis-cli for the SessionStart hook to use
apt update && apt install -y postgresql-client redis-tools

# Anything else slow that benefits from caching across sessions
```

**SessionStart hook** lives in the repo's `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [{
          "type": "command",
          "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/web-bootstrap.sh"
        }]
      }
    ]
  }
}
```

```bash
#!/bin/bash
# scripts/web-bootstrap.sh — runs in cloud sessions only.
[ "$CLAUDE_CODE_REMOTE" != "true" ] && exit 0

# Start preinstalled services
service postgresql start
service redis-server start

# Pull latest snapshot of read-only data from Neon → local PG (read cache)
psql "$NEON_DATABASE_URL" -c "\copy fact_crawl_seed TO STDOUT" | \
  psql -U postgres -d local_cache -c "\copy fact_crawl_seed FROM STDIN"

# Or, for write workloads, leave canonical to Neon and use local PG only as
# a workspace.
```

**Cost:** $0/mo at hobby scale (Neon free 0.5 GB, R2 free 10 GB egress, KV free 100k reads/day, Workers Cron free); ~$19–30/mo at serious (Neon Pro + Upstash); ~$50–100/mo at production with Hyperdrive.

### Option C″ — Cloudflare-only with git-snapshot bridge (no Neon)

If you want **strict Cloudflare-only** (no third-party DB):

```
   CLI ──┐
          ├──► Cloudflare D1 + R2 + KV
   Cowork ┘                  │
                             │ nightly Worker Cron Trigger
                             ▼
                       Snapshot to GitHub (allowlisted by default)
                             │
                             ▼
                       Web pulls + restores
```

- D1 has a 5 GB cap on free tier; `wrangler d1 export` produces a SQL dump committable to git
- Snapshots in `subagent-snapshots/` directory; LFS once size > 100 MB
- **Tradeoff:** ≤24h staleness for web. No real-time write-back unless web also writes to D1 via a Custom-allowlist'd Workers domain

Use this if you don't want Neon as a dependency. Otherwise Option C′ is simpler.

---

## 4. Recommendation — settled

**Default: Option C′ (Cloudflare + Neon hybrid with Custom allowlist).**

Reasoning:
- Leverages the user's existing Cloudflare estate (3+ domains, Storage & databases all enabled per dashboard screenshot)
- Neon's branching makes the multi-environment crawler work in `subagent-typescript/` and `subagent-python/` significantly nicer
- Custom allowlist removes the historic "web can't reach Neon" friction — Anthropic explicitly built this knob for this case
- Postgres 16 (preinstalled in sandbox) ≠ Postgres 18 (Neon target). For now, write SQL that's compatible with both; if you adopt PG18-only features later, Neon becomes load-bearing
- Total cost at hobby scale: $0–20/mo, drops to ~$25–50 at serious

**Graduate to Option A (AWS RDS)** when:
- Real-time multi-region replication matters
- Compliance forces AWS region (e.g. customer demands US-region)
- Spend on Option C′ exceeds ~$200/mo with no clear architectural reason

**Reject Option B** (AlloyDB) unless you specifically need its columnar accelerator. AlloyDB Auth Proxy in the cloud sandbox is unverified and adds setup friction.

**Reject Option C″** (git-snapshot) unless you have a hard "no third-party DB" requirement. The complexity isn't worth the small-scale-only constraint.

---

## 5. `managedsubagents.com` domain wiring

You own the domain in Cloudflare. Recommended:

| Subdomain | Points at | Purpose | In Custom allowlist? |
|---|---|---|---|
| `managedsubagents.com` | Cloudflare Pages | Marketing / docs landing | doesn't need to be |
| `db.managedsubagents.com` | CNAME → Neon endpoint | Cleaner DSN for humans (`db.managedsubagents.com:5432` vs `ep-xxx-xxx.us-east-2.aws.neon.tech`) | **add** to Custom allowlist for web |
| `api.managedsubagents.com` | Cloudflare Worker → Neon Data API or REST wrapper | Public API surface, web-reachable | **add** to Custom allowlist |
| `mcp.managedsubagents.com` | Cloudflare Worker → MCP server | Self-hosted MCP, web-reachable | **add** to Custom allowlist |

Cloudflare TLS automatic. The CNAME to Neon resolves cleanly; **the web sandbox uses the resolved hostname for allowlist matching**, so adding `db.managedsubagents.com` to your environment's Custom list is what unlocks it.

---

## 6. Cross-runtime parity matrix (rewritten)

| Capability | CLI | Cowork | Web (Trusted only) | Web (Custom + Option C′) |
|---|---|---|---|---|
| Read persistent Postgres (Neon) | ✅ | ✅ | ❌ blocked | ✅ live |
| Write to persistent Postgres (Neon) | ✅ | ✅ | ❌ blocked | ✅ live |
| Read persistent Redis (Upstash) | ✅ | ✅ | ❌ blocked | ✅ live |
| Use sandbox-preinstalled PG 16 / Redis 7.0 | n/a | n/a | ✅ as cache or workspace | ✅ as read-through cache |
| Use Cloudflare D1 / R2 / KV | ✅ via wrangler | ✅ | ❌ blocked | ✅ via Custom allowlist + Worker proxy on `api.managedsubagents.com` |
| Run knowledge-work plugins | ✅ | ✅ best | ✅ (with .mcp.json in repo) | ✅ |
| Run `/ultraplan` / `/ultrareview` | ✅ | ✅ | ✅ | ✅ |
| Hit `*.modelcontextprotocol.io` MCPs | ✅ | ✅ | ✅ (in default Trusted) | ✅ |

Option C′ achieves **full parity for all three runtimes** at a real but reasonable cost.

---

## 7. Setup-script + SessionStart-hook design (concrete)

The doc has explicit guidance on which to use:

| Need | Setup script | SessionStart hook |
|---|---|---|
| Install psql, alloydb-auth-proxy, etc. | ✅ runs once, cached | ❌ runs every session |
| `npm install`, `pip install -r requirements.txt` | ⚠️ works but not optimal | ✅ recommended (cloud-only via `CLAUDE_CODE_REMOTE` check) |
| Start postgresql, redis services | ❌ not captured by snapshot | ✅ runs every session |
| Pull latest data from Neon | ❌ stale across sessions | ✅ keeps web session current |

So the split is:

**Setup script (Anthropic-managed env config):**
- `apt install postgresql-client redis-tools curl jq`
- `apt install alloydb-auth-proxy` (if using Option B; otherwise skip)
- Pre-pull large Docker images that the orchestrator might run

**SessionStart hook (`.claude/settings.json` in repo):**
- `service postgresql start`
- `service redis-server start`
- `psql "$NEON_DATABASE_URL" -c "\copy ..."` to populate read-cache
- `cd subagent-orchestrator && npm ci` (or skip if `node_modules` already in repo)

---

## 8. Decisions (settled 2026-04-27)

| # | Decision | Resolution |
|---|---|---|
| 1 | Pick A vs B vs C′ vs C″ | **Option C′** (Cloudflare + Neon hybrid with Custom allowlist) |
| 2 | `db.managedsubagents.com` CNAME target | **Neon endpoint** once Neon project provisioned. Add to Custom allowlist. |
| 3 | Snapshot frequency for Option C″ | N/A — C″ rejected; if revisited, nightly via Workers Cron Trigger |
| 4 | MCP server registration script | **Build it now** (small, useful) — `subagent-mcp-servers/install.sh` already exists (PR #19); extend to handle web environment registration via the upcoming Anthropic env-config API when published |

---

## 9. What's intentionally not in this plan

- **Specific Postgres 18 feature parity matrix** between Neon / Supabase / AlloyDB / RDS. Both Neon and Supabase claim PG18 GA in 2026; AlloyDB is generally one major version behind. RDS support per AWS announcement schedule. Verify before committing to PG18-only features.
- **Cost projections at scale.** Numbers above are dev-tier estimates. Production sizing needs actual workload measurements.
- **The orchestrator that makes web sessions PR back to your repo.** That's the sibling plan — `CLAUDE_CLI_MAX_PLAN_AGENT_AS_AUTONOMOUS_WEB_PR_ORCHESTRATOR_PLAN.md`.
- **Secrets management.** No dedicated secrets store in cloud sessions yet (per doc); env vars are visible to anyone who can edit the environment. Anything sensitive (Neon connection string with embedded password) should rotate frequently and be scoped narrowly.

---

## 10. Status

**§8 settled.** Bootstrap milestones unblocked:

- [ ] Provision Neon project on the user's account
- [ ] Set `db.managedsubagents.com` CNAME → Neon endpoint
- [ ] Create Cloudflare R2 bucket `subagent-raw` + KV namespace `subagent-config`
- [ ] Create web environment in `claude.ai/code` settings: name `subagentapps-c-prime`, network access **Custom**, allowed domains include defaults + `*.neon.tech` + `db.managedsubagents.com` + `*.upstash.io` + `*.r2.cloudflarestorage.com`
- [ ] Add setup script: `apt install postgresql-client redis-tools curl jq`
- [ ] Add `scripts/web-bootstrap.sh` to repo + wire as SessionStart hook
- [ ] Set `NEON_DATABASE_URL` in environment vars (with the security caveat per §9)
- [ ] First cloud session: verify `psql "$NEON_DATABASE_URL"` connects and `\dt` works
