# A2G protocol repository: working agreements

This repository holds the **Agent2Game (A2G) protocol**: its specification and documentation site (`site/`, published at https://agent2game.org) and its machine-readable JSON Schema (`schema/`). SDKs, the reference decision service and example games live in **separate repositories**; do not add engine or service code here.

Keep this file in English. Reply to people in their own language.

## Layout

| Path | What it is |
| --- | --- |
| `site/` | Astro Starlight site. Pages are Markdown/MDX in `site/src/content/docs/`; the sidebar is in `site/astro.config.mjs` |
| `site/src/content/docs/specification/` | **The normative specification.** Changing it changes the protocol |
| `site/src/content/docs/design/` | Guides and proposals (scaling, local policy, cost, providers, deployment) |
| `site/src/components/` | Diagrams (`Architecture`, `MessageFlow`); home page: `Hero` (overrides Starlight's hero), `Arena` (playable protocol demo, simulated in the browser), `AgentPrompt`, `Principles`; brand: `SiteTitle` (wordmark with pixel-drawn "Game"), `Spark` (the pixel mark, also `public/favicon.svg`) |
| `site/src/llms.ts`, `site/src/pages/llms*.txt.ts` | Generate `/llms.txt` and `/llms-full.txt` from the docs at build time, never edit those outputs by hand |
| `site/scripts/check-csp.mjs` | Build step: fails if an inline script or style is not allowed by the page CSP |
| `site/deploy/nginx-security.conf` | Security headers for the production nginx |
| `schema/<version>/a2g.schema.json` | JSON Schema of the manifest and every message (one `$defs` entry each) |
| `schema/<version>/examples/<Def>/`, `invalid/<Def>/` | Instances that must validate / must be rejected |
| `NOTICE`, `LICENSE` | Apache-2.0; keep both in any redistribution |

## Rules

- **Specification, schema and examples change together.** Any change to a message or the manifest updates the spec page, `schema/<version>/a2g.schema.json`, and at least one example (and an invalid example for a new constraint) in the same change.
- **The version stays `0.1` until the owner decides to release.** Add features as optional fields; do not bump the version or create a `0.2` folder on your own.
- **Site version** (`site/package.json`) is `<protocol>.<n>` (`0.1.0`, `0.1.1`, ...): increase `n` with every deployed site change; it restarts at `<new protocol>.0` when the owner bumps the protocol. Everything stays below `1.0` until the owner declares the big release.
- **Mark what is not implemented.** The spec leads the reference implementations. Keep the "Implementation status" table on `implementations/service.md` honest, and mark proposals with the `:::caution[Proposed: not implemented yet]` aside.
- **Be game-agnostic.** The protocol must fit 2D and 3D games and any kind of entity. Game-specific content belongs only in examples.
- **Security is normative.** Changes that touch authentication, sessions, the cache, context or telemetry must keep `specification/security.md` consistent.
- Never use the em dash character (U+2014) in any text: site copy, docs, UI strings, code comments, commit messages. Use a period, comma, colon or parentheses instead.
- **Write all site text, schema descriptions and code comments in English.**
- **Do not add explanatory `.md` files** at the root; documentation belongs on the site. `README.md`, `SECURITY.md` and this file are the only root Markdown files.
- **Link glossary terms** on first mention with `[term](/glossary/#term)`; the site shows hover previews for them.
- **Colours mean protocol states.** `--a2g-native` (blue), `--a2g-ai` (green) and `--a2g-fallback` (amber) are used only for native AI, AI decisions and fallback, never as decoration.
- **Easter eggs stay harmless and on-message:** Konami code on the arena narrows `legal_actions`, five clicks on the spark show "1UP", the 404 page is "Game over". Keep them accessible and off by default.
- **No third-party requests from the site, except Google Analytics.** Fonts and assets are self-hosted; the CSP is strict. Google Analytics 4 (`G-B12Z880MB9`, owner's decision, no consent banner) is configured in `site/public/analytics.js` and allowed in the CSP in `site/astro.config.mjs`. Do not add other CDNs, analytics or embeds without the owner's decision.

## Checks

Run before every commit that touches the respective folder:

```sh
cd schema && npm ci && npm test            # schema: examples pass, invalid examples fail
cd site && npm ci && npm run build         # site: build, CSP check
```

The site build copies `schema/0.1/a2g.schema.json` to `/schema/0.1/a2g.schema.json` (the schema's `$id`). CI runs both checks on every push and pull request.

Starting the dev server: check `lsof -nP -iTCP:4321 -sTCP:LISTEN` first, then `cd site && npx astro dev --background` (manage with `astro dev stop|status|logs`). The dev server does not apply the CSP; use the production build to check it.

## Deploying

Production is a static build served by nginx on the owner's droplet. Deploy only when the owner asks: `cd site && npm run build && rsync -az --delete dist/ goserver:apps/agent2game.org/`, then check status codes and security headers. Never type sudo passwords or SSH passphrases; hand commands that need them to the owner.

## Astro references

- Content: https://docs.astro.build/en/guides/content-collections/
- Components: https://docs.astro.build/en/basics/astro-components/
- Starlight: https://starlight.astro.build/
