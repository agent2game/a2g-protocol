---
title: Modes and fallback
description: How control moves between the game's native AI, a local policy and the decision service.
sidebar:
  order: 8
---

## Modes in 0.1

| Mode | Telemetry value | Meaning |
| --- | --- | --- |
| Native | `native` | Default. AI control is off; no `/v1/decide` calls. |
| AI | `ai` | The game requests decisions from the service and executes valid, fresh ones. |

Switching modes increments [`epoch`](/glossary/#epoch), so late replies are discarded. Closing a debug panel or any UI must not change the mode.

## Five modes with a local policy

:::caution[Proposed: not implemented yet]
Part of the planned [local policy](/design/local-policy/). The `ai` mode above becomes `service`.
:::

| Mode | Telemetry value | Who decides | Network |
| --- | --- | --- | --- |
| Native | `native` | The game's native AI | no |
| Local | `local` | [Local policy](/glossary/#local-policy); native AI when it has no answer | no |
| Service | `service` | Decision service (large model) | yes |
| Cascade | `cascade` | Local policy when its confidence reaches the threshold, otherwise the service | yes |
| Shadow | `shadow` | The service decides; the local policy predicts alongside and the prediction is reported | yes |

Control always steps down on failure: **service → local → native**. A policy file that is missing, invalid or built for a different [manifest hash](/glossary/#manifest-hash) disables `local` and the game uses native AI.

A release build can run `local` with the SDK's network part disabled.

## Per-entity state

At any moment each entity is in one of these states, reported as the decision's `source` in [telemetry](/specification/telemetry/):

| Source | Meaning |
| --- | --- |
| `AI` | Executing a valid service decision within its `ttl_ms` |
| `LOCAL` | Executing a local-policy decision within its `ttl_ms` *(proposed)* |
| `FALLBACK` | Running [native AI](/glossary/#native-ai) because no valid decision exists |

## Fallback triggers

- service unreachable, timed out or busy;
- non-`200` response: `401` (reopen the session with a fresh credential), `403` (stop asking), `409` (resend the session), `429` (back off for `Retry-After`), see [Security](/specification/security/#errors);
- `source: FALLBACK` for the entity, its `code` says why: `unavailable`, `busy`, `refused`, `invalid_choice` or `budget` (see [fallback codes](/specification/decide/#fallback-codes));
- action not in the `legal_actions` the game sent;
- decision older than `ttl_ms`;
- `epoch` mismatch, or the entity no longer exists;
- the entity's input exceeded its type's [`max_input_tokens`](/specification/manifest/#token-budget) (`code: "budget"`);
- *(proposed)* local policy has no answer: no model for the type, missing input field, or every legal action masked out.

## Timing in the reference implementation

| Parameter | Value |
| --- | --- |
| Entities per decide batch | ≤ 16 |
| In-flight decide requests per client | ≤ 2 |
| Refresh, entity sees player / does not | ~3 s / ~8 s |
| Min interval for change-triggered refresh | 500 ms |
| Client decide timeout | 4 s |
| Concurrent provider calls in the service | 4 |
| Provider timeout | 3 s |
| Default decision TTL | 12 s |
| Cascade confidence threshold *(proposed)* | 0.6, per type |

These are tuning values, not protocol constants. Only `ttl_ms` is set through the protocol.
