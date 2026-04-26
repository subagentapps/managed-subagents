# CLI_COWORK_PLAN.md

Generated 2026-04-26. Replaces `INFRASTRUCTURE_PLAN.draft.md` for the CLI ↔ Cowork ↔ web parity story. Pairs with `CLAUDE_CLI_MAX_PLAN_AGENT_AS_AUTONOMOUS_WEB_PR_ORCHESTRATOR_PLAN.md` (the orchestrator side).

This plan covers: how `claude` CLI on the user's MacBook, `Cowork` on macOS, and `claude-code-on-the-web` reach the *same* persistent state — and which database / Redis / domain choices make that possible given the web-allowlist constraint.

---

## 1. The three runtimes

| Runtime | Where it runs | Persistent state today | Network reach |
|---|---|---|---|
| **CLI** (`claude` on MacBook) | `/Users/alexzh/`, full filesystem reach | Local files; `~/.claude/projects/<encoded-cwd>/` for sessions; user MCP servers via stdio | Open — anything you can `curl` from the laptop |
| **Cowork** (macOS desktop app) | Local on macOS, but operates via Anthropic's agent infrastructure | Cowork-shared folders (user-picked); MCP connectors registered in Cowork settings | Open — same as a normal app, plus Cowork's connector network |
| **Web** (`claude.ai/code`) | Anthropic-managed VM | Ephemeral container with preinstalled Postgres + Redis; persists via GitHub | **Restricted to allowlist** — see `code.claude.com/docs/en/claude-code-on-the-web.md` |

The web allowlist is the hard constraint. Persistent state has to be reachable from all three.

---

## 2. The web allowlist constraint, applied to databases

| Database / cache | CLI | Cowork | Web | Why web ❌ |
|---|---|---|---|---|
| Neon Postgres 18 | ✅ | ✅ | ❌ | `*.neon.tech` not on allowlist |
| Supabase Postgres 18 | ✅ | ✅ | ❌ | `*.supabase.co` not on allowlist |
| Cloudflare D1 (SQLite) | ✅ via `wrangler` | ✅ | ❌ | D1 endpoints not on allowlist |
| Cloudflare Hyperdrive | ✅ | ✅ | ❌ | Hyperdrive endpoints not on allowlist |
| AlloyDB (GCP) | ✅ | ✅ | 🟡 if proxy via `*.googleapis.com` | needs verification |
| AWS RDS Postgres / ElastiCache | ✅ | ✅ | ✅ | `*.amazonaws.com` is on the allowlist |
| `db.managedsubagents.com` (custom subdomain) | ✅ | ✅ | ❌ | hostname not on allowlist regardless of DNS target |
| Web sandbox preinstalled Postgres / Redis | ❌ | ❌ | ✅ | local to VM only |

So *any* canonical persistent layer that needs to be reachable from the web sandbox is **AWS** or **AlloyDB-via-proxy**. Everything else implies a sync pattern, not direct access.

---

## 3. The three viable architectures

### Option A — AWS-canonical (web-allowlist native)

```
                     ┌──────────┐
   CLI ────────────► │          │
                     │ AWS RDS  │ ◄──── Web sandbox
   Cowork ─────────► │ Postgres │
                     │ +ElastiC │
                     │  Redis   │
                     └──────────┘
```

- **AWS RDS Postgres 18** (or Aurora Serverless v2) for persistent SQL
- **AWS ElastiCache Redis 7** for caching / queues / session
- All three runtimes connect via `*.amazonaws.com` (allowlisted)
- `db.managedsubagents.com` → DNS-only CNAME for documentation/UX; the actual hostname Claude Code resolves is `*.amazonaws.com`
- **Cost:** ~$25–50/mo for small instances; ~$200–500/mo for production sizes
- **Tradeoff:** AWS, not the Cloudflare-native stack the rest of this repo leans on

### Option B — AlloyDB on GCP (web-allowlist via proxy)

```
                     ┌──────────┐
   CLI ────────────► │  AlloyDB │ ◄── Web (via Auth Proxy
   Cowork ─────────► │ Postgres │     using *.googleapis.com)
                     │ +Memory- │
                     │ store    │
                     └──────────┘
```

- **AlloyDB Postgres 18 equivalent** — best Postgres-on-GCP performance per dollar
- **Memorystore Redis 7** for caching
- Web reach via **AlloyDB Auth Proxy**, which connects through `*.googleapis.com`
- **Open verification needed** — confirm the proxy actually connects from inside the web sandbox
- **Cost:** ~$60–80/mo small, scales linearly

### Option C — Hybrid: Neon + Upstash for CLI/Cowork, web uses preinstalled with sync

```
              ┌──────────┐
   CLI ─────► │   Neon   │
              │ Postgres │ ──┐ snapshot to S3 nightly
   Cowork ──► │  Upstash │   │
              │   Redis  │   ▼
              └──────────┘   ┌──────────────────┐
                             │ S3 (allowlisted) │
                             └──────────────────┘
                                    │ restore on web session start
                                    ▼
                             ┌──────────────────┐
                             │  Web preinstalled│
                             │  PG + Redis      │
                             └──────────────────┘
```

- **Neon Postgres 18** + **Upstash Redis** for CLI/Cowork (cheapest serverless option)
- Web sessions use the *preinstalled* Postgres + Redis in the sandbox
- A snapshot/restore workflow keeps web sessions hydrated from S3 (which IS allowlisted)
- **Tradeoff:** no real-time write-back from web to Neon. Eventually consistent. But cheapest by far at small scale.
- **Cost:** ~$0–20/mo at hobby scale; ~$40–80/mo at serious

---

## 4. Recommendation

Default: **Option C — hybrid with Neon + Upstash + S3 snapshot for web parity**, with a documented graduation path to **Option A (AWS RDS + ElastiCache)** when:

- Real-time write-back from web is required, AND
- You have ≥1 paying user, OR
- Monthly spend on Option C exceeds $100

Reasoning:
- This repo is dev-stage, not production. Option A's $25–50/mo is real money for non-revenue infra.
- Neon's branching is genuinely useful for the multi-environment crawler work in `subagent-typescript/` and `subagent-python/`.
- The snapshot pattern is well-trodden (rsync to S3 + `pg_restore` on web start) and the worst-case lag is one day.
- Switching from Option C to Option A is a one-week project (DSN swap, dump/restore, point-in-time cutover) — not load-bearing to commit early.

**Reject Option B** unless you specifically need AlloyDB's columnar accelerator. AlloyDB Auth Proxy through the web sandbox is unverified — rely on it only after testing.

---

## 5. `managedsubagents.com` domain wiring

You own the domain in Cloudflare. It's currently empty. Recommended setup:

| Subdomain | Points at | Purpose |
|---|---|---|
| `managedsubagents.com` | Cloudflare Pages (static landing) | Marketing / docs landing |
| `db.managedsubagents.com` | CNAME → your Neon endpoint | Cosmetic Postgres alias for CLI/Cowork (not used by web — see §2) |
| `api.managedsubagents.com` | Cloudflare Worker | If you ever build a public API |
| `mcp.managedsubagents.com` | Cloudflare Worker → MCP server | If you self-host MCP servers |

Cloudflare TLS handles certificates automatically. No further action needed for domain ownership; the CNAME to Neon is one DNS record.

**Critical:** `db.managedsubagents.com` does *not* solve the web-allowlist problem — the hostname your Postgres client resolves still needs to match the allowlist. The CNAME is only useful for humans and the CLI/Cowork.

---

## 6. Cross-runtime parity matrix

What each runtime can do in each option:

| Capability | CLI | Cowork | Web (Option A) | Web (Option C) |
|---|---|---|---|---|
| Read persistent Postgres | ✅ | ✅ | ✅ live | 🟡 from snapshot, ≤24h stale |
| Write to persistent Postgres | ✅ | ✅ | ✅ live | ❌ (writes go to local web Postgres only) |
| Read persistent Redis | ✅ | ✅ | ✅ live | 🟡 from snapshot |
| Use Anthropic-installed PG/Redis in web | n/a | n/a | optional | ✅ default |
| Run knowledge-work plugins | ✅ | ✅ best | ✅ | ✅ |
| Run `/ultraplan` / `/ultrareview` | ✅ | ✅ | ✅ | ✅ |
| Run subagent-cowork programmatic wrappers | ✅ | partial | ✅ | ✅ |

Option C trades web write-back for ~$0 at hobby scale. Worth it for v0.1.

---

## 7. The "knowledge-work plugin" implication

The 16 plugins documented in `subagent-cowork/` all want **specific MCP servers per `~~category` placeholder**. Some categories (e.g. `~~CRM` for legal, `~~CI/CD` for engineering, `~~ATS` for HR) have **no included server upstream** — you must bring your own.

Three places to register MCP servers, ordered by reach:

| Location | Reaches | Persistence |
|---|---|---|
| `~/.claude/settings.json` `mcpServers` | CLI only | persistent across sessions |
| Cowork settings UI | Cowork only | persistent across sessions |
| Web session `/mcp` add | Web session only | per-session |

For a connector (say HubSpot) to work in **all three runtimes**, register it in all three places. There's no global "register once, reach everywhere" yet.

A `subagent-cowork/connectors.toml` could become the source of truth, with a script that propagates entries to each location's config.

---

## 8. Open decisions

1. **Pick A vs C.** Default = C (hybrid). Override only if real-time web writes are a requirement.
2. **`db.managedsubagents.com` CNAME target.** Pick a Postgres provider in §3 first.
3. **Snapshot frequency for Option C.** Recommend nightly via GitHub Actions; snapshot lands in `s3://managedsubagents-snapshots/<YYYY-MM-DD>/`.
4. **MCP server registration script.** Build it now (small, useful) or defer until the second-time-you-have-to-edit-three-config-files frustration arrives.

---

## 9. What's intentionally not in this plan

- **Specific Postgres 18 feature parity matrix** between Neon / Supabase / AlloyDB / RDS. Both Neon and Supabase claim PG18 GA in 2026; AlloyDB is generally one major version behind. RDS support per AWS announcement schedule. Verify before committing.
- **Cost projections at scale.** Numbers above are dev-tier estimates. Production sizing needs actual workload measurements.
- **The orchestrator that makes web sessions PR back to your repo.** That's the sibling plan — `CLAUDE_CLI_MAX_PLAN_AGENT_AS_AUTONOMOUS_WEB_PR_ORCHESTRATOR_PLAN.md`.

---

## 10. Status

Awaiting decisions §8. After they're settled, this plan converts into bootstrap milestones and lands in either Cloudflare Workers config (Option C) or Terraform / CDK for AWS (Option A).
