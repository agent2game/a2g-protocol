---
title: Reference service
description: The reference A2G decision service, what it does, how to run it and its limits.
sidebar:
  order: 3
---

The reference decision service is a small Python service on FastAPI and uvicorn, with a Docker image. It implements the server side of the protocol for any game that sends a valid manifest.

:::caution[Not published yet]
The service is not yet available in a public repository. Publishing it is on the [roadmap](/roadmap/).
:::

## What it does

- Validates sessions, manifests (all field types, scopes, profiles, events, token budgets, cache rules) and every decide request against the client's manifest; returns the [manifest hash](/specification/manifest/#manifest-hash).
- Applies [`/v1/context`](/specification/context/) updates to scopes and profiles atomically.
- Sends one request per batch to the active [provider](/design/providers/): [OpenAI Decisions](/design/providers/#openai-decisions) (default) or [TypeSafe Jev](/design/providers/#typesafe-jev), with one typed `choice` question per entity offering only its legal actions. The input follows the [specified order](/specification/decide/#what-the-provider-sees) (world, scope chain, profiles, type descriptions, state, situation context, then entities), and all game values are passed as data, separate from the service's instructions.
- Computes session-scoped situation context: `population`, `nearby`, `observed_entities`, the `parent` decision and `members` of [groups](/specification/decide/#groups).
- Enforces [token budgets](/specification/manifest/#token-budget) (~4 characters per token; warns in the console when a type's budget is below its question size) and serves the [decision cache](/specification/manifest/#decision-cache) (in memory, game-wide for trusted `local` sessions).
- Issues a `decision_id` with every AI decision and applies a [report](/specification/report/) only once, for the session and entity it was issued to; stores the last 8 as [memory](/glossary/#memory).
- Serves the **Agent2Game Console** at `/` (optional, `A2G_CONSOLE=off` runs the service headless): a **Provider** switch saved across restarts, clients, context (scopes, profiles, entity types), entities with groups, decisions, cache hits, fallback codes, memory, costs and logs, with a Pretty/JSON view per card, a manifest editor (download, or apply as a console-side override for testing) and deletion of old sessions.
- Stores session summaries, every priced provider call, manifest overrides and the provider choice in a local SQLite file, so spend survives restarts. Telemetry, memory and logs stay in memory.
- Holds the provider key; it is never sent to the game or the Agent2Game Console.

## Run

```bash
echo "OPENAI_API_KEY=..." > .env
docker compose up -d --build
```

Settings in `.env` (the process environment wins):

| Variable | Meaning |
| --- | --- |
| `OPENAI_API_KEY`, `TYPESAFE_API_KEY` | Provider keys; only the active provider's key is needed |
| `A2G_PROVIDER` | `openai` (default) or `jev`; a choice made in the Agent2Game Console overrides it |
| `A2G_ALLOWED_ORIGINS` | Exact loopback origins of browser games on local dev servers, comma-separated, for example `http://localhost:5173` ([rules](/specification/security/#browser-games-during-development)) |
| `A2G_CONSOLE` | `off` serves only `/v1/*` and `/health` |
| `A2G_PROVIDER_CALLS` | Concurrent provider calls (default 16); match your provider's rate limit |
| `A2G_PORT`, `A2G_DB` | Listen port (default 8787) and SQLite file |

Without Docker: `pip install -r requirements.txt`, then `python3 decision_service.py` (Python 3.12+).

The service listens on `http://127.0.0.1:8787` (Docker publishes it on `127.0.0.1` only; the SQLite file lives in a volume). It runs as one process, because sessions, the decision cache and memory are held in it. The local profile has no authentication, so do not expose it on a public interface. Open `/` for the Agent2Game Console and `/health` for status. The console uses relative paths, so it also works under a sub-path behind a game's admin proxy (see [Integrate](/guides/integrate/#5-run-and-observe)).

## Implementation status

The specification leads; the reference implementations follow. Status of protocol 0.1 features:

| Feature | Reference service | Godot SDK | JS/TS SDK |
| --- | --- | --- | --- |
| [Scopes](/specification/manifest/#scopes), [profiles](/specification/manifest/#profiles), [`/v1/context`](/specification/context/) | yes | yes: `scope_provider`, `update_context()` (replayed after a new session), `track(..., {"profile": ...})` | yes: `scope` option, `updateContext()`, `track(..., { profile })` |
| [Groups](/specification/decide/#groups) (`parent`, `members`) | yes | yes: `set_parent()` | yes: `setParent()` |
| [Events](/specification/manifest/#events) (`events`, `trigger`, `refresh_ms`) | yes | yes: adapter `trigger()`; `refresh_ms` as the default interval | yes: adapter `trigger()`; `refresh_ms` as the default interval |
| [Field types](/specification/manifest/#field-types) `vector2`, `vector3`, `entity_ref`, lists, numeric enums | yes | yes (passed through from the adapter) | yes (passed through from the adapter) |
| [Token budget](/specification/manifest/#token-budget) | yes (~4 chars/token) | n/a | n/a |
| [Decision cache](/specification/manifest/#decision-cache) | yes: in memory, game-wide for `local` sessions; decisions with confidence below 0.5 are not cached; equivalent entities in one batch are asked once | n/a (transparent) | n/a (transparent) |
| [Fallback codes](/specification/decide/#fallback-codes) | yes | yes: kept per entity for debugging | yes: `decision(entity)` |
| [Manifest hash](/specification/manifest/#manifest-hash) | yes | yes: stored from the session response | yes |
| [`decision_id`](/specification/security/#decision-integrity) in decisions and reports | yes | yes | yes |
| [Local-profile request checks](/specification/security/#local-profile-request-checks) (`Host`, `Origin`, `Content-Type`) | yes | n/a | n/a |
| [Developer-listed browser origins](/specification/security/#browser-games-during-development) | yes: `A2G_ALLOWED_ORIGINS` (comma-separated exact loopback origins) | n/a | n/a (works with it) |
| [Session-scoped context](/specification/security/#session-scoped-context) | yes | n/a | n/a |
| `401`/`403`/`409`/`429` handling | `409` only (no authentication in `local`) | yes: reopen on `401`/`409`, stop on `403`, back off on `429` `Retry-After` | yes: same as Godot |
| [Security](/specification/security/): `server`/`client` profiles, API keys, join tokens, session tokens | no: `local` profile only (loopback, no authentication) | no | no (a `headers` option is ready for credentials) |
| [Registered manifests](/specification/security/#registered-manifests), rate limits, client-session cache isolation | no | n/a | n/a |

The service rejects manifests with unknown keys and texts over the length limits, and checks its own examples against the [JSON Schema](https://github.com/agent2game/a2g-protocol/tree/main/schema) in its test suite.

## Planned: decision log and training

:::caution[Proposed: not implemented yet]
See [Local policy](/design/local-policy/).
:::

- **Persistent decision log** per game and manifest hash (JSONL): context, legal actions, full probabilities, outcome, local prediction. Today all history is in memory and lost on restart.
- **Training** of local policies per entity type: decision trees first, then ensembles and small neural networks. Soft labels from the teacher's probabilities; optional outcome weighting.
- **Training report:** agreement with the teacher per type and per situation, coverage map, model size, readable rules for trees.
- **Agent2Game Console Policy tab:** data per manifest version and data epoch, Train button, policy versions with metrics, shadow agreement, share of service calls in cascade.
- **Local routes:** `POST /v1/policy/train` and `GET /v1/policy`, part of the reference service, not of the protocol.

## Limits

| Limit | Value |
| --- | --- |
| Bind address | `127.0.0.1` only, the `local` [security profile](/specification/security/#deployment-profiles); never expose it |
| Concurrent provider calls | 16 by default (`A2G_PROVIDER_CALLS`); extra batches get `FALLBACK` with `code: "busy"` |
| Provider timeout | 3 s |
| Clients | No cap (one client per match on a game server); clients idle for 1 hour leave memory, their summaries stay in SQLite |
| Log events per client | 300 |
| Storage | Telemetry, memory and logs in memory; session summaries, costs, overrides and the provider choice in SQLite |

The service is meant for local development and evaluation. Hosted deployment needs authentication and an access model first.
