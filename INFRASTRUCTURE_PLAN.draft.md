# INFRASTRUCTURE_PLAN.draft.md

Generated 2026-04-26. **Draft / pre-research.** This file captures the framing, constraints, and open questions I surfaced *before* doing the database/infra research itself. It exists so the user can add instructions on top before the actual `INFRASTRUCTURE_PLAN.md` is written.

When the research happens, this draft becomes either: (a) the §0 "background and constraints" section of `INFRASTRUCTURE_PLAN.md`, or (b) a discarded scratchpad if the user redirects scope.

---

## What the user is actually asking for (three goals fused)

1. **Database evaluation** — Compare:
   - Neon Postgres 18
   - Supabase Postgres 18
   - AlloyDB (GCP)
   - Cloudflare Postgres options (D1 is SQLite, not Postgres; Hyperdrive is a Postgres *accelerator*, not a database)
   - Redis 7 alternatives

2. **Domain wiring** — `managedsubagents.com` (currently empty, in Cloudflare) becomes the front door to persistent Postgres + Redis. Could mean: a custom subdomain pointing at managed Postgres with Cloudflare TLS; a Worker proxy; or just DNS pointing upstream.

3. **Local + web parity** — Run `claude-code` from the Mac CLI *and* from `claude-code-on-the-web` web sessions, both connecting to the same persistent Postgres + Redis. Avoid re-installing them each web session.

---

## The constraint that changes everything: the claude-code-on-the-web allowlist

`claude-code-on-the-web` runs in a sandboxed Anthropic-managed VM with a network allowlist. The user pasted the entire allowlist — and **none of the database hosts are on it by default**:

| Database | CLI (Mac) | Web sessions | Reason for web ❌ |
|---|---|---|---|
| **Neon Postgres** | ✅ | ❌ | `*.neon.tech` not on allowlist |
| **Supabase Postgres** | ✅ | ❌ | `*.supabase.co` not on allowlist |
| **Cloudflare D1** | ✅ via `wrangler` | ❌ | D1 endpoints not on allowlist |
| **Cloudflare Hyperdrive** | ✅ | ❌ | Hyperdrive endpoints not on allowlist |
| **AlloyDB** (GCP) | ✅ | 🟡 maybe | Reachable *if* AlloyDB Auth Proxy uses `*.googleapis.com` — needs verification |
| **AWS RDS Postgres / ElastiCache Redis** | ✅ | ✅ | `*.amazonaws.com` is on the allowlist |
| **Anthropic-preinstalled Postgres + Redis** in the web sandbox | ❌ (CLI doesn't have them) | ✅ | Local to the VM, no network needed |
| **Custom subdomain on `managedsubagents.com`** | ✅ | ❌ | Not on allowlist regardless of DNS target |

**The web allowlist is the binding constraint.** "Use the same persistent DB from both CLI and web" is achievable, but the database has to be one the allowlist permits — effectively **AWS or AlloyDB** for cloud-hosted, or **the preinstalled local one** for in-sandbox.

Note: the allowlist may have a "Trusted" mode escape hatch the user can configure. Need to verify whether self-added domains can be added to the allowlist by the user, or if it's strictly Anthropic-controlled.

---

## Three viable architectures

### Option A — AWS-hosted persistent layer (uses the allowlist)
- AWS RDS for Postgres 18 (or Aurora Serverless v2)
- AWS ElastiCache for Redis 7
- Reachable from CLI and web via `*.amazonaws.com`
- `db.managedsubagents.com` → CNAME to RDS endpoint (cosmetic; the hostname Claude Code resolves still has to be `*.amazonaws.com` for the egress filter)
- **Cost:** ~$25–50/mo for small instances

### Option B — AlloyDB on GCP (needs allowlist verification)
- AlloyDB for Postgres 18 (or near-equivalent)
- Memorystore Redis 7 on GCP
- Reach via AlloyDB Auth Proxy through `*.googleapis.com`
- **Open:** Need to verify the proxy actually works through Anthropic's egress filter

### Option C — Hybrid: Neon for CLI, preinstalled for web, sync nightly
- Neon Postgres 18 + Upstash Redis as canonical persistent store, accessed from CLI
- Each web session uses preinstalled local Postgres + Redis; bootstrapped from snapshot maintained in S3 (allowlisted) or GitHub releases
- Snapshot workflow exports CLI-side data nightly; web sessions restore on startup
- **Tradeoff:** No web-time writes back to canonical without going through GitHub or S3. Eventually consistent. But Neon's serverless-Postgres pricing is dramatically cheaper than AWS.

---

## What the research doc would cover (when written)

Single document at `~/claude-projects/github-organizations/subagentapps/managed-subagents/INFRASTRUCTURE_PLAN.md` containing:

1. **Database matrix** — Neon 18 / Supabase 18 / AlloyDB / RDS / Cloudflare options, scored on:
   - Cost at small + medium scale
   - Postgres 18 feature parity (release status, gaps)
   - Branching/forking
   - Vector support (pgvector version)
   - Web-allowlist compatibility
   - IAM auth
   - Connection pooling (PgBouncer / built-in)
   - Observability hooks (logs, metrics, traces export)
2. **Redis matrix** — ElastiCache / Memorystore / Upstash / DragonflyDB / preinstalled local — same scoring
3. **The five team-style ownership domains** mapped to the architecture:
   - API Core (foundational reliability + performance)
   - API Capabilities (vision, tool use, computer use — frontier capability tracking)
   - API Knowledge (retrieval + grounding over external data)
   - API Distributability (enterprise-ready infrastructure)
   - API Agents (long-horizon agentic workflows)
4. **Domain wiring for `managedsubagents.com`** — DNS, Cloudflare TLS, optional Worker proxy, and the hard limit imposed by the web allowlist
5. **Local + web parity strategy** — Options A/B/C above with a recommendation
6. **Cost projection** at three usage levels (hobby / serious / production)
7. **Migration path** between options (start Neon, switch to AlloyDB at scale)

Explicitly **out of scope** for the research doc:
- Technical-stack rundown of FastAPI/React/K8s/Cloud Run — those are already-made choices; they go in `pyproject.toml` and `package.json`, not a research doc
- Code skeleton — plans only, per the user's instruction

---

## Two questions that shape the answer

### Q1. Is the web-allowlist constraint hard or soft?

I.e., is `claude-code-on-the-web` actually a workflow used *enough* that the persistent DB has to be reachable from it? Or is it occasional, and the CLI is primary?

- **Hard:** AWS RDS or AlloyDB are the only real options. Neon and Supabase ruled out for the *web* path even if kept for the CLI.
- **Soft:** Neon is dramatically cheaper and the right answer for the CLI; web sessions get the preinstalled DBs and we live with eventual sync.

### Q2. What scale are we optimizing for?

- **Hobby** (~$0–$20/mo, dev-only): Neon free tier + Upstash free tier; web sessions use preinstalled.
- **Serious side project** (~$50–$200/mo, real users): Neon Pro + Upstash Pro, or AWS RDS small instance.
- **Production with paying customers** (~$500+/mo): AlloyDB or Aurora Serverless v2 + ElastiCache; web allowlist matters for ops parity.

### Default if user doesn't answer

- **Q1: Soft.** CLI is primary. Pick Neon + Upstash for best price/feature for the CLI; document the preinstalled-DB-for-web pattern as the parity strategy.
- **Q2: Serious side project tier.** Design for ~$50–$200/mo with a documented graduation path to AlloyDB if real load arrives.

---

## Domains paste from the user (verbatim, the entire claude-code-on-the-web allowlist)

Captured here so the research doc can reason against the actual list, not a summary.

- **Anthropic services:** `api.anthropic.com`, `statsig.anthropic.com`, `docs.claude.com`, `platform.claude.com`, `code.claude.com`, `claude.ai`
- **Version control:** `github.com`, `www.github.com`, `api.github.com`, `npm.pkg.github.com`, `raw.githubusercontent.com`, `pkg-npm.githubusercontent.com`, `objects.githubusercontent.com`, `release-assets.githubusercontent.com`, `codeload.github.com`, `avatars.githubusercontent.com`, `camo.githubusercontent.com`, `gist.github.com`, `gitlab.com`, `www.gitlab.com`, `registry.gitlab.com`, `bitbucket.org`, `www.bitbucket.org`, `api.bitbucket.org`
- **Container registries:** `registry-1.docker.io`, `auth.docker.io`, `index.docker.io`, `hub.docker.com`, `www.docker.com`, `production.cloudflare.docker.com`, `download.docker.com`, `gcr.io`, `*.gcr.io`, `ghcr.io`, `mcr.microsoft.com`, `*.data.mcr.microsoft.com`, `public.ecr.aws`
- **Cloud platforms:** `cloud.google.com`, `accounts.google.com`, `gcloud.google.com`, `*.googleapis.com`, `storage.googleapis.com`, `compute.googleapis.com`, `container.googleapis.com`, `azure.com`, `portal.azure.com`, `microsoft.com`, `www.microsoft.com`, `*.microsoftonline.com`, `packages.microsoft.com`, `dotnet.microsoft.com`, `dot.net`, `visualstudio.com`, `dev.azure.com`, `*.amazonaws.com`, `*.api.aws`, `oracle.com`, `www.oracle.com`, `java.com`, `www.java.com`, `java.net`, `www.java.net`, `download.oracle.com`, `yum.oracle.com`
- **JS/Node:** `registry.npmjs.org`, `www.npmjs.com`, `www.npmjs.org`, `npmjs.com`, `npmjs.org`, `yarnpkg.com`, `registry.yarnpkg.com`
- **Python:** `pypi.org`, `www.pypi.org`, `files.pythonhosted.org`, `pythonhosted.org`, `test.pypi.org`, `pypi.python.org`, `pypa.io`, `www.pypa.io`
- **Ruby:** `rubygems.org`, `www.rubygems.org`, `api.rubygems.org`, `index.rubygems.org`, `ruby-lang.org`, `www.ruby-lang.org`, `rubyforge.org`, `www.rubyforge.org`, `rubyonrails.org`, `www.rubyonrails.org`, `rvm.io`, `get.rvm.io`
- **Rust:** `crates.io`, `www.crates.io`, `index.crates.io`, `static.crates.io`, `rustup.rs`, `static.rust-lang.org`, `www.rust-lang.org`
- **Go:** `proxy.golang.org`, `sum.golang.org`, `index.golang.org`, `golang.org`, `www.golang.org`, `goproxy.io`, `pkg.go.dev`
- **JVM:** `maven.org`, `repo.maven.org`, `central.maven.org`, `repo1.maven.org`, `repo.maven.apache.org`, `jcenter.bintray.com`, `gradle.org`, `www.gradle.org`, `services.gradle.org`, `plugins.gradle.org`, `kotlinlang.org`, `www.kotlinlang.org`, `spring.io`, `repo.spring.io`
- **Other package managers:** `packagist.org`, `www.packagist.org`, `repo.packagist.org`, `nuget.org`, `www.nuget.org`, `api.nuget.org`, `pub.dev`, `api.pub.dev`, `hex.pm`, `www.hex.pm`, `cpan.org`, `www.cpan.org`, `metacpan.org`, `www.metacpan.org`, `api.metacpan.org`, `cocoapods.org`, `www.cocoapods.org`, `cdn.cocoapods.org`, `haskell.org`, `www.haskell.org`, `hackage.haskell.org`, `swift.org`, `www.swift.org`
- **Linux:** `archive.ubuntu.com`, `security.ubuntu.com`, `ubuntu.com`, `www.ubuntu.com`, `*.ubuntu.com`, `ppa.launchpad.net`, `launchpad.net`, `www.launchpad.net`, `*.nixos.org`
- **Dev tools and platforms:** `dl.k8s.io`, `pkgs.k8s.io`, `k8s.io`, `www.k8s.io`, `releases.hashicorp.com`, `apt.releases.hashicorp.com`, `rpm.releases.hashicorp.com`, `archive.releases.hashicorp.com`, `hashicorp.com`, `www.hashicorp.com`, `repo.anaconda.com`, `conda.anaconda.org`, `anaconda.org`, `www.anaconda.com`, `anaconda.com`, `continuum.io`, `apache.org`, `www.apache.org`, `archive.apache.org`, `downloads.apache.org`, `eclipse.org`, `www.eclipse.org`, `download.eclipse.org`, `nodejs.org`, `www.nodejs.org`, `developer.apple.com`, `developer.android.com`, `pkg.stainless.com`, `binaries.prisma.sh`
- **Cloud services and monitoring:** `statsig.com`, `www.statsig.com`, `api.statsig.com`, `sentry.io`, `*.sentry.io`, `downloads.sentry-cdn.com`, `http-intake.logs.datadoghq.com`, `*.datadoghq.com`, `*.datadoghq.eu`, `api.honeycomb.io`
- **Content delivery:** `sourceforge.net`, `*.sourceforge.net`, `packagecloud.io`, `*.packagecloud.io`, `fonts.googleapis.com`, `fonts.gstatic.com`
- **Schema and config:** `json-schema.org`, `www.json-schema.org`, `json.schemastore.org`, `www.schemastore.org`
- **MCP:** `*.modelcontextprotocol.io`

---

## Technical-stack context the user provided (for ownership-domain mapping in the research doc)

| Category | Items |
|---|---|
| Languages | Python, TypeScript |
| Frameworks | FastAPI, React |
| Infrastructure | GCP, Kubernetes, Cloud Run, AWS, Azure |
| Databases | PostgreSQL (AlloyDB), Vector Stores, Firestore |
| Tools | Feature Flagging, Prometheus, Grafana, Datadog |

Five ownership domains the user wants the architecture to map to:
1. **API Core** — foundational reliability + performance of the API
2. **API Capabilities** — frontier model capabilities (vision, tool use, computer use); kept current from `platform.claude.com/docs` and `code.claude.com/docs`
3. **API Knowledge** — retrieval + grounding over external data
4. **API Distributability** — enterprise-ready infrastructure
5. **API Agents** — long-horizon agentic workflows in production where Claude *is* the API agent

---

## Status

**Awaiting user instructions** before research happens. Once instructions arrive, this draft becomes the §0 of `INFRASTRUCTURE_PLAN.md` (or gets discarded if scope changes).
