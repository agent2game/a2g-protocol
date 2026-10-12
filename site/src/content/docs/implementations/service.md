---
title: Reference service
description: The reference A2G decision service, what it does, how to run it and its limits.
sidebar:
  order: 2
---

The reference decision service is a single Python file using only the standard library. It implements the server side of the protocol for any game that sends a valid manifest.

:::caution[Not published yet]
The service is not yet available in a public repository. Publishing it is on the [roadmap](/roadmap/).
:::

## What it does

- Validates sessions, manifests (all field types, scopes, profiles, events, token budgets, cache rules) and every decide request against the client's manifest; returns the [manifest hash](/specification/manifest/#manifest-hash).
- Applies [`/v1/context`](/specification/context/) updates to scopes and profiles atomically.
- Sends one request to the [OpenAI Decisions API](https://developers.openai.com/api/docs/guides/decisions) per batch, with one typed `choice` question per entity offering only its legal actions. The input follows the [specified order](/specification/decide/#what-the-provider-sees) (world, scope chain, profiles, type descriptions, state, situation context, then entities), and all game values are passed as data, separate from the service's instructions.
- Computes session-scoped situation context: `population`, `nearby`, `observed_entities`, the `parent` decision and `members` of [groups](/specification/decide/#groups).
- Enforces [token budgets](/specification/manifest/#token-budget) (~4 characters per token) and serves the [decision cache](/specification/manifest/#decision-cache) (in memory, game-wide for trusted `local` sessions).
- Issues a `decision_id` with every AI decision and applies a [report](/specification/report/) only once, for the session and entity it was issued to; stores the last 8 as [memory](/glossary/#memory).
- Serves the **Agent2Game Console** at `/`: clients, context (scopes, profiles, entity types), entities with groups, decisions, cache hits, fallback codes, memory, costs and logs, with a Pretty/JSON view per card, a manifest editor (download, or apply as a console-side override for testing) and deletion of old sessions.
- Stores session summaries, every priced provider call and manifest overrides in a local SQLite file, so spend survives restarts. Telemetry, memory and logs stay in memory.
- Holds the provider key; it is never sent to the game or the Agent2Game Console.

## Run

```bash
echo "OPENAI_API_KEY=..." > .env
python3 decision_service.py
```

The service listens on `http://127.0.0.1:8787`. Open `/` for the Agent2Game Console and `/health` for status.

## Implementation status

The specification leads; the reference implementations follow. Status of protocol 0.1 features:

| Feature | Reference service | Godot SDK |
| --- | --- | --- |
| [Scopes](/specification/manifest/#scopes), [profiles](/specification/manifest/#profiles), [`/v1/context`](/specification/context/) | yes | yes: `scope_provider`, `update_context()` (replayed after a new session), `track(..., {"profile": ...})` |
| [Groups](/specification/decide/#groups) (`parent`, `members`) | yes | yes: `set_parent()` |
| [Events](/specification/manifest/#events) (`events`, `trigger`, `refresh_ms`) | yes | yes: adapter `trigger()`; `refresh_ms` as the default interval |
| [Field types](/specification/manifest/#field-types) `vector2`, `vector3`, `entity_ref`, lists, numeric enums | yes | yes (passed through from the adapter) |
| [Token budget](/specification/manifest/#token-budget) | yes (~4 chars/token) | n/a |
| [Decision cache](/specification/manifest/#decision-cache) | yes: in memory, game-wide for `local` sessions; decisions with confidence below 0.5 are not cached; equivalent entities in one batch are asked once | n/a (transparent) |
| [Fallback codes](/specification/decide/#fallback-codes) | yes | yes: kept per entity for debugging |
| [Manifest hash](/specification/manifest/#manifest-hash) | yes | yes: stored from the session response |
| [`decision_id`](/specification/security/#decision-integrity) in decisions and reports | yes | yes |
| [Local-profile request checks](/specification/security/#local-profile-request-checks) (`Host`, `Origin`, `Content-Type`) | yes | n/a |
| [Session-scoped context](/specification/security/#session-scoped-context) | yes | n/a |
| `401`/`403`/`409`/`429` handling | `409` only (no authentication in `local`) | yes: reopen on `401`/`409`, stop on `403`, back off on `429` `Retry-After` |
| [Security](/specification/security/): `server`/`client` profiles, API keys, join tokens, session tokens | no: `local` profile only (loopback, no authentication) | no |
| [Registered manifests](/specification/security/#registered-manifests), rate limits, client-session cache isolation | no | n/a |

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
| Concurrent provider calls | 4; extra batches get `FALLBACK` with `code: "busy"` |
| Provider timeout | 3 s |
| Clients kept | 32 |
| Log events per client | 300 |
| Storage | In memory; lost on restart |

The service is meant for local development and evaluation. Hosted deployment needs authentication and an access model first.
