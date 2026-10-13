---
title: POST /v1/telemetry
description: Periodic snapshot of what the game is actually doing.
sidebar:
  order: 7
---

The game sends a snapshot **in every mode**, including native-AI mode, while paused and with debug UI closed: about once per second in real-time games, and after every step in turn-based or server games whose state changes only on turns (a timer there would resend the same snapshot). Telemetry never triggers a provider call.

## Request

Except in the `local` profile, every request MUST include `Authorization: Bearer <session_token>` (see [Security](/specification/security/#authentication)).

```json
{
  "client_id": "lango-5f2c91",
  "mode": "ai",
  "paused": false,
  "scene": "Level1",
  "scope": "forest",
  "last_error": "",
  "world": { "player_hp_fraction": 0.4, "repellent": false },
  "entities": [
    {
      "id": "28735",
      "type": "bee",
      "name": "Bee",
      "state": "FLEE",
      "pending": false,
      "fields": { "hp_fraction": 0.333, "distance_to_player": 140.2 },
      "decision": { "source": "AI", "action": "flee", "confidence": 0.71 },
      "position": [412.5, 188.0],
      "parent": "swarm-3"
    }
  ]
}
```

| Field | Limits |
| --- | --- |
| `mode` | `native` or `ai` in 0.1; *proposed:* `native`, `local`, `service`, `cascade`, `shadow` |
| `paused` | Boolean, required |
| `entities` | ≤ 128 |
| `world`, `fields` | ≤ 24 scalar values each |
| `decision` | ≤ 12 scalar values, plus `slots` (`{slot: action}`) for a decision with [slots](/specification/decide/#decision-slots) |
| `position` | Optional `[x, y]` or `[x, y, z]`; used for `nearby`, `members` and population context |
| `scope` | Optional. The active [scope](/specification/manifest/#scopes), for the console and logs |
| `.parent` | Optional. The entity's group, as in [decide](/specification/decide/#groups); lets a parent see all its members, not only those in the current batch |
| `.profile` | Optional. The entity's [profile](/specification/manifest/#profiles) name |

Telemetry must not contain personal data ([privacy](/specification/security/#privacy)). Only scalars are kept in `world`, `fields` and `decision`; vectors, lists and unknown top-level keys are dropped. Telemetry is for observing, not for deciding, so it does not need the full observation. Include observe-only entities (such as the player) so others can perceive them.

## Why telemetry matters

`state` is what the game is **actually executing**, separate from the last chosen `action`. Comparing them separates facts that are easy to confuse:

- the service is up vs. the provider actually answered;
- an action was chosen vs. the game executes it;
- AI mode is on vs. entities are currently AI-controlled.

The execution log derived from telemetry is sampled once per second, not frame-accurate.

## Proposed: local policy fields

With a [local policy](/design/local-policy/), an entity's `decision.source` can be `LOCAL`, and `decision` may include `policy_version` and, in `shadow`, `local_action` and `local_confidence`. The values remain scalars, so the existing limits apply.
