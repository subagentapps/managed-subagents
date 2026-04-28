# Cloudflare Worker Deployment Record

## managedsubagents-web — initial workers.dev deploy

- **Timestamp (UTC):** 2026-04-28T03:41:52Z
- **Account ID:** e6294e3ea89f8207af387d459824aaae
- **Worker name:** managedsubagents-web
- **Deployment ID:** (not surfaced by `wrangler deploy` v4.85.0 output; tracked via Version ID)
- **Version ID:** 29a57afa-c39f-4060-bf27-3a64edaeb562
- **Preview URL:** https://managedsubagents-web.alex-e62.workers.dev
- **workers.dev subdomain:** alex-e62

### Deploy command

Run from `webapp/` (sibling to `subagent-orchestrator/`):

```
npm run build
npx wrangler deploy
```

`account_id` is pinned in `webapp/wrangler.toml`, so no `CLOUDFLARE_ACCOUNT_ID` env override was required.

### Build output

```
dist/index.html                   0.67 kB │ gzip:  0.40 kB
dist/assets/index-CJI2Y4Mv.css    2.22 kB │ gzip:  1.00 kB
dist/assets/index-C17HNtF5.js   145.29 kB │ gzip: 46.96 kB
```

### Wrangler upload summary

```
✨ Success! Uploaded 3 files (1.73 sec)
Total Upload: 0.19 KiB / gzip: 0.15 KiB
Bindings:
  env.ASSETS  → Assets
Uploaded managedsubagents-web (6.12 sec)
Deployed managedsubagents-web triggers (0.99 sec)
  https://managedsubagents-web.alex-e62.workers.dev
Current Version ID: 29a57afa-c39f-4060-bf27-3a64edaeb562
```

## Verification

- **Status:** succeeded
- `curl -I https://managedsubagents-web.alex-e62.workers.dev` → `HTTP/2 200`
  - `content-type: text/html`
  - `cf-cache-status: HIT`
- `curl` body contains the expected landing-page `<title>`:
  `managedsubagents — Autonomous PR orchestration for Claude Code`
- SPA fallback (`not_found_handling = "single-page-application"`) is wired via `wrangler.toml` `[assets]` block.

## Scope boundary

This record covers only the workers.dev preview deploy. Custom-domain / route binding for `managedsubagents.com` is **out of scope** here and is tracked under the separate `cf-bind-domain` task. No `routes` or `[[custom_domains]]` config was added or modified.

---

## managedsubagents-web — Custom Domain bind (cf-bind-domain)

- **Timestamp (UTC):** 2026-04-28T03:53Z
- **Worker name:** managedsubagents-web
- **Version ID:** 0837ad39-76a5-4a86-a929-b8cf687aa0d0
- **Bound from:** interactive Claude session (Cloudflare MCP not connected; the dispatched `cf-bind-domain` subagent had no MCP access, so the bind was performed via `wrangler deploy` from the user's authed terminal)

### `wrangler.toml` change

```toml
workers_dev = true
preview_urls = true

[[routes]]
pattern = "managedsubagents.com"
custom_domain = true

[[routes]]
pattern = "www.managedsubagents.com"
custom_domain = true
```

### Deploy output

```
Deployed managedsubagents-web triggers (1.19 sec)
  https://managedsubagents-web.alex-e62.workers.dev
  managedsubagents.com (custom domain)
  www.managedsubagents.com (custom domain)
Current Version ID: 0837ad39-76a5-4a86-a929-b8cf687aa0d0
```

### Verification

| URL                                                  | HTTP | notes                          |
|------------------------------------------------------|------|--------------------------------|
| https://managedsubagents.com                         | 200  | TLS cert CN=managedsubagents.com, served by Cloudflare edge (172.67.214.224) |
| https://www.managedsubagents.com                     | 200  |                                |
| https://managedsubagents-web.alex-e62.workers.dev    | 200  | restored after re-enabling `workers_dev = true` |

Local resolver may need `sudo dscacheutil -flushcache` to see the new domain; the public DNS at `1.1.1.1` and `8.8.8.8` resolved immediately to Cloudflare's edge.

### Scope-gap note for future runs

The `cf-bind-domain` task assumed a connected Cloudflare MCP. None was installed in either the dispatched subagent or the interactive session — `mcp__cloudflare__*` tools never appeared. Future automation either needs the Cloudflare MCP installed (`https://developers.cloudflare.com/agents/` for the install path) OR the orchestrator's task prompt should declare `wrangler` as the binding mechanism instead of the MCP.

---

## managedsubagents-web — brutalist redesign deploy

- **Timestamp (UTC):** 2026-04-28T04:33:00Z
- **Worker name:** managedsubagents-web
- **Version ID:** 898da0c3-54b0-4259-81d1-adc027d965a5
- **Trigger:** mobile-first brutalist-terminal redesign (PRs #65 wd-1 viewport, #66 wd-2 vitest+BUILD_META, #67 wd-3 Hero, #68 wd-4 Stack, #69 wd-5 SelfRef, #70 wd-6 Footer, #71 wd-7 compose App, #72 wd-8 Playwright)

### Highlights

- Mobile-first CSS targeting iPhone 16 Pro Max (430×932) as the primary canvas
- Brutalist-terminal aesthetic: pure black, monospace, ASCII boxes, phosphor-green accent (#00ff5f)
- Self-referential build-meta counter ("this site was shipped by N dispatched subagents")
- Vitest unit tests + Playwright iPhone-viewport smoke tests
- Bundle: `index.html` 1.11kB · `index-BG2LsUM2.css` 7.54kB (gzip 2.27kB) · `index-DAcGmY6B.js` 148.98kB (gzip 48.08kB)

### Verification

- `curl https://managedsubagents.com` → HTTP 200, `<title>managedsubagents — autonomous PR orchestration</title>` (live)
- `curl https://managedsubagents-web.alex-e62.workers.dev` → HTTP 200
- `curl --resolve www.managedsubagents.com:443:172.67.214.224 https://www.managedsubagents.com` → HTTP 200 (local DNS cache only; public resolvers see it immediately)
- Playwright e2e: 4 specs × 2 viewports (iphone-16-pro-max + desktop-chrome) = 8/8 passing
- Vitest: BUILD_META + Hero + Stack + SelfRef tests all passing

### Cost ledger (subagent-driven build)

PRs #65–#72 were dispatched one-at-a-time through the orchestrator. Combined cost across the 8 web-disposition tasks: roughly $5.41 (per dispatch_log: $0.61 + $0.79 + $1.36 + $0.75 + $0.70 + $0.53 + $0.67 + ~$0 manual). Tasks 8 (Playwright install) and 10 (deploy) ran from the interactive session because the dispatched subagent sandbox can't run `npx playwright install` (full ~75MiB browser binary downloads) or `wrangler deploy` (needs Cloudflare OAuth that subagents don't carry).

---

## managedsubagents-web — SEO + Install batch deploy

- **Timestamp (UTC):** 2026-04-28T13:00:00Z
- **Worker name:** managedsubagents-web
- **Version ID:** c1a098cf-387e-4143-8a5e-b0aad39e4e6c
- **Trigger:** SEO + UX batch (PRs #80 og-card, #81 robots+sitemap, #82 jsonld, #83 install-section)

### Highlights

- OpenGraph + Twitter card meta — links to managedsubagents.com unfurl with brand-consistent preview on Twitter/X, Slack, iMessage, Discord (image is `/og-image.png`, follow-up to create the actual asset)
- `robots.txt` + `sitemap.xml` served at the apex
- `SoftwareApplication` JSON-LD schema (offers price=0, applicationCategory=DeveloperApplication)
- New in-page `Install` section between Stack and SelfRef — three brutalist-terminal steps (clone, build, doctor) with expected output

### Verification

- All 4 URLs (apex + workers.dev + robots.txt + sitemap.xml) → HTTP 200
- OG meta + Twitter card + JSON-LD all present in served HTML
- Install section verified present in JS bundle (rendered client-side by React)
- Bundle: `index.html` 2.58kB · `index-CQWXiCHG.css` 9.11kB (gzip 2.41kB) · `index-Bc9Jiof4.js` 151.04kB (gzip 48.74kB)
  - Bundle grew by 2.06kB JS / 1.57kB CSS / 1.47kB HTML vs prior deploy `898da0c3` — proportional to the added Install section + meta blocks

### Cost ledger (this batch)

PR #78 fix-readonly-heuristic (manual; ~$0 — pre-flight wasted $1.63 across two trapped local dispatches *before* the fix was made)
PR #80 og-card $0.37
PR #81 robots-sitemap $0.33
PR #82 jsonld $0.28
PR #83 install-section $0.67
Total batch dispatches: ~$1.65 (excluding the $1.63 wasted on the heuristic-bug victims)

---

## managedsubagents-web — batch 3 deploy (assets + changelog)

- **Timestamp (UTC):** 2026-04-28T13:13:00Z
- **Worker name:** managedsubagents-web
- **Version ID:** e4dcd6c8-8b0b-406f-ac55-ff62e40985f1
- **Trigger:** missing assets + changelog (PRs #87 og-image, #88 favicon, #89 changelog) — does NOT include #86 because that was orchestrator-only

### Highlights

- Real `/og-image.png` exists (1200×630, 14kB, phosphor-green ASCII art) — social unfurlers now have an image
- Proper favicon set: 16/32 desktop + 180×180 apple-touch-icon, replacing the inline data-URI `>` SVG
- New in-page Changelog section between Install and SelfRef listing the 6 most recent meaningful merged PRs

### Verification

- `/og-image.png` → 200, 1200×630 PNG, 14kB (under 60kB target)
- `/favicon-16.png`, `/favicon-32.png`, `/apple-touch-icon.png` → all 200
- HTML now contains the full `<link>` set instead of inline data-URI
- Changelog text present in JS bundle (rendered client-side by React)
- Bundle: `index.html` 2.51kB · CSS 10.60kB (gzip 2.64kB) · JS 152.63kB (gzip 49.23kB)
  - JS grew by 1.59kB / CSS by 1.49kB vs prior deploy `c1a098cf`, proportional to the added Changelog section

### Cost ledger (this batch)

PR #86 fix-readyformerge $0.66 (orchestrator-only, not deployed)
PR #87 og-image $0.43
PR #88 favicon $0.38
PR #89 changelog $0.63
Total batch dispatches: $2.10 (all four landed first try, no waste — heuristic fix from morning paid off)
