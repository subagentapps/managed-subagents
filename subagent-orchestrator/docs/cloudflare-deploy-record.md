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
