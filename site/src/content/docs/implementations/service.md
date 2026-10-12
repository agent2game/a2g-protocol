---
title: Reference service
description: The reference A2G decision service — what it does, how to run it and its limits.
sidebar:
  order: 2
---

The reference decision service is a single Python file using only the standard library. It implements the server side of the protocol for any game that sends a valid manifest.

:::caution[Not published yet]
The service is not yet available in a public repository. Publishing it is on the [roadmap](/roadmap/).
:::

## What it does

- Validates sessions, manifests and every decide request against the client's manifest.
- Sends one request to the [OpenAI Decisions API](https://developers.openai.com/api/docs/guides/decisions) per batch, with one typed `choice` question per entity offering only its legal actions. The input contains the world text, world state, each entity's observation and its recent decisions with outcomes.
- Stores the last 8 [reports](/specification/report/) per entity as [memory](/glossary/#memory); drops memory when an entity disappears from telemetry.
- Serves a browser console at `/`: clients, manifests, entities with their fields, decisions, memory and logs.
- Holds the provider key; it is never sent to the game or the console.

## Run

```bash
echo "OPENAI_API_KEY=..." > .env
python3 decision_service.py
```

The service listens on `http://127.0.0.1:8787`. Open `/` for the console and `/health` for status.

## Implementation status

The specification leads; the reference implementations follow. Specified in protocol 0.1 but **not yet supported** here:

| Feature | Reference service | Godot SDK |
| --- | --- | --- |
| [Scopes](/specification/manifest/#scopes), [profiles](/specification/manifest/#profiles), [`/v1/context`](/specification/context/) | no | no |
| [Groups](/specification/decide/#groups) (`parent`, `members`) | no | no |
| [Events](/specification/manifest/#events) (`events`, `trigger`, `refresh_ms`) | no | partly: re-asks on a value signature, not on named events |
| [Field types](/specification/manifest/#field-types) `vector2`, `vector3`, `entity_ref`, lists | no | no |
| [Token budget](/specification/manifest/#token-budget) | no | — |
| [Decision cache](/specification/manifest/#decision-cache) | no | — (transparent) |
| [Fallback codes](/specification/decide/#fallback-codes) | no: `reason` only | — |
| [Manifest hash](/specification/manifest/#manifest-hash) | no | — |
| Numeric enum values | no: strings only | — |
| [Security](/specification/security/): `server`/`client` profiles, API keys, join tokens, session tokens | no: `local` profile only (loopback, no authentication) | no |
| [`decision_id`](/specification/security/#decision-integrity) in decisions and reports | no: reports match by action | no |
| [Registered manifests](/specification/security/#registered-manifests), rate limits, client-session cache isolation | no | — |
| `401`/`403`/`429` handling | — | no: any non-`200` falls back |
| [Local-profile request checks](/specification/security/#local-profile-request-checks) (`Host`, `Origin`, `Content-Type`) | **no — today any web page open in the developer's browser can send requests to the service** | — |
| [Session-scoped context](/specification/security/#session-scoped-context) | yes: `nearby` and `population` use only the client's own telemetry | — |

Today the reference service **ignores** unknown keys such as `scopes`, `events`, `cache`, `parent` or `trigger` — they are accepted but have no effect — and **rejects** the new field types and numeric enum values. Do not rely on these features until this table is empty.

## Planned: decision log and training

:::caution[Proposed — not implemented yet]
See [Local policy](/design/local-policy/).
:::

- **Persistent decision log** per game and manifest hash (JSONL): context, legal actions, full probabilities, outcome, local prediction. Today all history is in memory and lost on restart.
- **Training** of local policies per entity type: decision trees first, then ensembles and small neural networks. Soft labels from the teacher's probabilities; optional outcome weighting.
- **Training report:** agreement with the teacher per type and per situation, coverage map, model size, readable rules for trees.
- **Console Policy tab:** data per manifest version and data epoch, Train button, policy versions with metrics, shadow agreement, share of service calls in cascade.
- **Local routes:** `POST /v1/policy/train` and `GET /v1/policy` — part of the reference service, not of the protocol.

## Limits

| Limit | Value |
| --- | --- |
| Bind address | `127.0.0.1` only — the `local` [security profile](/specification/security/#deployment-profiles); never expose it |
| Concurrent provider calls | 4; extra batches get `FALLBACK` ("Service busy") |
| Provider timeout | 3 s |
| Clients kept | 32 |
| Log events per client | 300 |
| Storage | In memory; lost on restart |

The service is meant for local development and evaluation. Hosted deployment needs authentication and an access model first.
