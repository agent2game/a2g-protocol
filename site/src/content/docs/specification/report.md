---
title: POST /v1/report
description: Tell the service what happened to a decision, building per-entity memory.
sidebar:
  order: 6
---

When an AI decision ends, the game reports how it ended and what changed. The service stores the last 8 reports per entity and includes them in the next `/v1/decide` for that entity, this is the entity's short-term [memory](/glossary/#memory).

## Request

Except in the `local` profile, every request MUST include `Authorization: Bearer <session_token>` (see [Security](/specification/security/#authentication)).

```json
{
  "client_id": "lango-5f2c91",
  "entity_id": "28735",
  "decision_id": "d_01J9Z4K7",
  "action": "flee",
  "status": "executed",
  "outcome": {
    "hp_fraction_delta": 0,
    "distance_to_player_delta": 116.2,
    "world_player_hp_fraction_delta": -0.1,
    "seconds": 4.2
  }
}
```

| Field | Notes |
| --- | --- |
| `action` / `actions` | The action the game executed, or for a decision with [slots](/specification/decide/#decision-slots) `{slot: action}` for the slots it executed. With [sampling](/specification/decide/#sampling) it may differ from the service's `action`, but must have been legal for the decision |
| `decision_id` | The `decision_id` of the decision being reported. Reports for ids not issued to this session and entity, or already reported, are ignored, fake reports cannot poison memory |
| `status` | `executed`: ran until replaced (also when a long turn outlasted its TTL); `blocked`: the game refused to execute it; `expired`: TTL passed with no new decision |
| `outcome` | Up to 12 scalar values chosen by the game |

The reference SDK reports numeric **deltas** of the observation and world (`<field>_delta`, world keys prefixed `world_`) between the decision and its end, plus `seconds`. This is a convention, not a requirement.

Memory for an entity is dropped when it disappears from [telemetry](/specification/telemetry/), and all memory is lost when the service restarts.

## Response

```json
{ "ok": true }
```

## Proposed: training fields

:::caution[Proposed: not implemented yet]
Part of the planned [local policy](/design/local-policy/).
:::

Reports become training examples for the [local policy](/design/local-policy/). Additional optional fields:

```json
{
  "client_id": "…",
  "entity_id": "72259471404",
  "action": "flee",
  "source": "AI",
  "status": "executed",
  "outcome": { "hp_fraction_delta": 0, "seconds": 4.2 },
  "local_prediction": { "action": "flee", "confidence": 0.74 },
  "policy_version": "2026-10-12.3"
}
```

| Field | Notes |
| --- | --- |
| `source` | `AI` (service decision) or `LOCAL` (local-policy decision) |
| `local_prediction` | In `shadow` and `cascade`: what the local policy would have chosen, for agreement metrics |
| `policy_version` | The local policy that made or predicted the decision |

The reference service would keep these examples in a persistent decision log, tagged with the manifest hash, instead of only in memory.
