---
title: POST /v1/decide
description: Request actions for a batch of entities in one call — with scope, profiles, groups, events, cached decisions and fallback codes.
sidebar:
  order: 5
---

The game sends the shared [world state](/glossary/#world-state), optionally the active [scope](/glossary/#scope), and up to 16 [entities](/glossary/#entity) that need a decision. The service answers with one decision per entity.

## Request

Except in the `local` profile, every request MUST include `Authorization: Bearer <session_token>` (see [Security](/specification/security/#authentication)).

```json
{
  "client_id": "lango-5f2c91",
  "epoch": 7,
  "world": { "player_hp_fraction": 0.4, "repellent": false },
  "scope": "forest_boss",
  "scope_state": { "boss_phase": 2 },
  "entities": [
    {
      "id": "28735",
      "type": "bee",
      "observation": {
        "hp_fraction": 0.333,
        "distance_to_player": 96.4,
        "sees_player": true,
        "current_action": "chase"
      },
      "legal_actions": ["idle", "wander", "chase", "flee"],
      "position": [412.5, 188.0],
      "parent": "swarm-3",
      "trigger": "hit"
    },
    {
      "id": "30122",
      "type": "boss",
      "profile": "queen_bee",
      "observation": { "hp_fraction": 0.4, "distance_to_player": 210.0, "sees_player": true, "current_action": "idle" },
      "legal_actions": ["idle", "chase", "flee"]
    }
  ]
}
```

| Field | Required | Notes |
| --- | --- | --- |
| [`epoch`](/glossary/#epoch) | yes | Non-negative integer the game increments when context is invalidated (mode switch, scene change). Echoed back |
| `world` | yes | Exactly the manifest's `world_fields` |
| `scope` | no | Name of the active [scope](/specification/manifest/#scopes) |
| `scope_state` | with `scope` | Exactly the fields declared along the scope's chain. Omit when the chain declares none |
| `entities` | yes | 1–16 entities, unique `id`s |
| `.type` | yes | A type declared in the manifest, with actions |
| `.observation` | yes | [Observation](/glossary/#observation): exactly the type's `fields` |
| [`.legal_actions`](/glossary/#legal-actions) | yes | Non-empty, unique subset of the type's `actions` that the game allows **right now** |
| `.position` | no | `[x, y]` or `[x, y, z]`. If omitted, the last telemetry position is used |
| `.profile` | no | A [profile](/specification/manifest/#profiles) name; must match the profile's `type` if it has one |
| `.parent` | no | Id of the entity this one belongs to — its squad, faction or director. See [groups](#groups) |
| `.trigger` | no | One of the type's [`events`](/specification/manifest/#events): why it asks now. See [events](#events) |

`legal_actions` is how the game enforces its rules: an enemy that cannot see the player may only be offered `idle` and `wander`.

## Response

```json
{
  "a2g": "0.1",
  "epoch": 7,
  "latency_ms": 840,
  "decisions": [
    {
      "id": "28735",
      "source": "AI",
      "action": "flee",
      "label": "Move directly away from the player to preserve health",
      "confidence": 0.71,
      "ttl_ms": 12000,
      "decision_id": "d_01J9Z4K7",
      "cached": true
    },
    {
      "id": "30122",
      "source": "FALLBACK",
      "code": "unavailable",
      "reason": "Provider timed out",
      "ttl_ms": 12000
    }
  ]
}
```

| Field | Notes |
| --- | --- |
| `source` | `AI` — a valid model choice (fresh or cached); `FALLBACK` — no choice for this entity |
| `action` | One of the entity's `legal_actions` (only when `AI`) |
| `label` | The manifest description of the action — **not** model reasoning |
| `confidence` | Provider confidence, or `null` |
| `decision_id` | Opaque, unique id of an `AI` decision. The game sends it back in the [report](/specification/report/); see [decision integrity](/specification/security/#decision-integrity) |
| `cached` | `true` when the decision was reused from the [decision cache](/specification/manifest/#decision-cache) instead of a new model call |
| `code` | Machine-readable fallback reason (only when `FALLBACK`), see below |
| `reason` | Human-readable fallback reason (only when `FALLBACK`) |
| `ttl_ms` | [TTL](/glossary/#ttl): validity window from the manifest |

### Fallback codes

| `code` | Meaning | Game reaction |
| --- | --- | --- |
| `unavailable` | Provider error, timeout or missing credentials | Native AI; retry on the next refresh |
| `busy` | Service at capacity | Native AI; retry later |
| `refused` | The model declined to choose | Native AI |
| `invalid_choice` | The model answered outside `legal_actions` or not at all | Native AI |
| `budget` | The entity's input exceeded the type's [`max_input_tokens`](/specification/manifest/#token-budget) | Native AI; send less context |

Each entity is decided independently: one refused, invalid or over-budget entity yields `FALLBACK` for that entity only. If the whole provider call fails, every entity sent in that call gets `FALLBACK`; cached decisions are unaffected.

## Scope

When a request names a `scope`, the model receives the manifest's `world`, then the text of each scope along the chain from root to the named scope, then `scope_state`. Use scopes for whatever is shared by everything on screen: the level, the zone, the weather, the alarm state. Change the scope when the player moves on; add new scopes with [`POST /v1/context`](/specification/context/).

## Groups

An entity's `parent` links it to another entity — usually a squad, faction or director type that makes higher-level decisions:

- A **child** sees its parent's latest decision as `parent`: `id`, `type`, `action`, `label` and how many seconds ago it was made. "The squad decided to flank left" shapes the member's own choice.
- A **parent** sees its **members** — up to 8 entities whose `parent` is its id, nearest first when positions are known — as `members`: `id`, `type`, `state`, chosen `action` and their fields. A squad decides with its members in view.

Members are known from decide requests and [telemetry](/specification/telemetry/), which also carries `parent`. A parent does not need a position or a body in the game world.

## Events

A `trigger` names one of the type's `events`. The model is told what just happened (the event description) in the question for that entity. Games should ask on events and otherwise refresh slowly ([`refresh_ms`](/specification/manifest/#entity-types)); idle entities then cost nothing.

## What the provider sees

The service builds one model request per batch. Static content comes first so it is identical across requests, then dynamic state, then the entities:

| Order | Part | Sent |
| --- | --- | --- |
| 1 | `world` text | once per request |
| 2 | Scope texts, root → active scope | once per request |
| 3 | Texts of the profiles used in this batch | once per request |
| 4 | `world` state and `scope_state` | once per request |
| 5 | Situation context: `population`, `observed_entities` | once per request |
| 6 | Per entity: type, profile name, observation, memory, `nearby`, `parent`, `members`, trigger | per entity |
| 7 | One typed question per entity offering only its `legal_actions` | per entity |

Parts 1–5 are shared and paid once per batch; parts 6–7 are the entity-specific input the [token budget](/specification/manifest/#token-budget) applies to.

The situation context is computed by the service from the **same session's** [telemetry](/specification/telemetry/) — never from other sessions ([security](/specification/security/#session-scoped-context)) — so games do not have to:

| Context | Contents |
| --- | --- |
| `population` | Per type in the current scene: `alive` now, `seen` since the scene started, `gone` = seen − alive. Resets when `scene` changes |
| `nearby` (per entity) | Up to 5 nearest entities within the type's `perception_radius`: `id`, `type`, `distance`, `state`, chosen `action` and their `fields`. Needs positions and a radius |
| `observed_entities` | Every observe-only entity (no actions, e.g. the player) with its `fields` and `nearby_counts` per type within its own `perception_radius` — "who is near the player" |
| `memory` (per entity) | The entity's last 8 decisions with their [reported](/specification/report/) outcomes |

The reference SDK also re-asks every entity (after at least 500 ms) when the number of tracked entities changes, so a death or a spawn updates everyone's choice.

## Cascade mode (proposed)

In the proposed `cascade` mode the SDK first evaluates the [local policy](/design/local-policy/) and sends to `/v1/decide` only the entities whose local confidence is below the threshold. The request and response shapes do not change.

## Game obligations

- Drop the response if `epoch` no longer matches.
- Re-check that `action` is in the `legal_actions` it sent.
- Treat a decision as expired after `ttl_ms` and return to native AI.
- On `FALLBACK`, run the game's [native AI](/glossary/#native-ai) — never invent an action.
- Treat a cached decision exactly like a fresh one.
- In multiplayer, call `/v1/decide` from the game server, not from clients ([Security](/specification/security/#decision-integrity)).
