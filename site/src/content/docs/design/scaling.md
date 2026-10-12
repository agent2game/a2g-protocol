---
title: Scaling to complex games
description: How to use A2G for large worlds with levels, rich characters, groups and many players, and why cost must grow with decisions, not with the world.
sidebar:
  order: 1
---

## The core rule

**Cost and load must scale with the number of decisions, not with the size of the world.**

A world can have a million entities, a hundred levels and a novel's worth of lore. If only the decisions that matter reach a model, and everything else runs on native code, caches or small local policies, the system scales with the game. The protocol gives a game six tools for that. All of them are optional parts of protocol 0.1.

| Tool | What it saves | Specification |
| --- | --- | --- |
| [Groups](#1-decide-at-the-right-level) | Decisions: one per squad instead of one per member | [`parent`](/specification/decide/#groups) |
| [Scopes and profiles](#2-send-static-content-once) | Tokens: lore and characters sent once per request | [Scopes](/specification/manifest/#scopes), [profiles](/specification/manifest/#profiles), [`/v1/context`](/specification/context/) |
| [Bounded rich fields](#3-rich-but-bounded-observations) | Tokens: only the relevant few of anything | [Field types](/specification/manifest/#field-types), [token budget](/specification/manifest/#token-budget) |
| [Events](#4-events-instead-of-polling) | Decisions: idle entities stop asking | [`events`, `refresh_ms`](/specification/manifest/#events), [`trigger`](/specification/decide/#events) |
| [Decision cache](#5-reuse-decisions) | Decisions: equivalent situations share one answer | [`cache`](/specification/manifest/#decision-cache) |
| [Local policy](#6-learn-local-policies) *(proposed)* | Decisions: common cases answered in the game | [Local policy](/design/local-policy/) |

## 1. Decide at the right level

Most games already have layers of behavior. Drive the **highest layer that benefits from judgment** with A2G and leave the lower layers to native code.

| Level | Example decision | Frequency | Who executes |
| --- | --- | --- | --- |
| Director | "Increase pressure in zone B", "send a flanking group" | per minute, per level | Game systems |
| Squad / faction | "Flank left", "retreat to cover", "guard the gate" | every few seconds, per group | Members' native AI |
| Individual | "Chase", "flee", "talk" | every few seconds, per entity | Entity's native AI |
| Frame-level | Aiming, steering, animation, pathfinding | every frame | **Always native, never A2G** |

A squad or director is just an entity type whose actions are high-level intents. It needs no body in the world. Members point to it with `parent`:

```json
{ "id": "swarm-3", "type": "swarm", "observation": { "size": 6, "avg_hp_fraction": 0.7 },
  "legal_actions": ["press_attack", "encircle", "fall_back"] }

{ "id": "28735", "type": "bee", "parent": "swarm-3", "observation": { "...": "..." },
  "legal_actions": ["chase", "flee", "idle", "wander"] }
```

The swarm sees its members (`members`) when it decides; each bee sees the swarm's latest decision (`parent`). The game can go further and not ask members at all: the adapter turns "encircle" into orders for each bee's native AI. One squad decision then replaces ten individual ones; one director decision shapes hundreds of entities.

## 2. Send static content once

Descriptions, lore, character backstories and level briefings are large but rarely change. Sending them with every decision wastes tokens and latency.

- **Scopes** carry level- and zone-level context in a chain: `world` → `forest` → `forest_boss`. A request names the active scope and sends only its dynamic `scope_state`.
- **Profiles** carry per-character text. Entities reference them by name, and the text goes once per request even if many entities share it.
- **`/v1/context`** adds scopes and profiles when a level loads or a character appears, so the manifest stays small at start.
- The model input is ordered **static first**: world → scopes → profiles → dynamic state → entities. The shared prefix is identical between requests, which providers can cache, and it is paid once per batch.

Per-decision cost then depends on the dynamic part only (a few hundred tokens) regardless of how much lore the game has.

## 3. Rich but bounded observations

Complex games need positions, references to other entities and collections:

```json
"fields": {
  "position": "vector3",
  "target": "entity_ref",
  "nearby_allies": { "list": { "id": "entity_ref", "hp_fraction": "number" }, "max": 8 }
}
```

Two rules keep this cheap:

- **The game decides relevance.** The adapter sends the 8 nearest allies, the 5 most valuable items, the current objective, not everything it knows. The service also adds `nearby` from telemetry positions without the game sending anything.
- **A budget catches mistakes.** `max_input_tokens` per type makes the service refuse (with `FALLBACK`, `code: "budget"`) an entity whose context grew too large, instead of silently paying for it.

## 4. Events instead of polling

Polling every few seconds is simple, but in a large world most entities have nothing new to decide. Declare what matters as `events` and set a long `refresh_ms`:

```json
"events": { "player_spotted": "The player just came into view", "ally_died": "A nearby ally was killed" },
"refresh_ms": 30000
```

The game asks with `"trigger": "player_spotted"` when it happens; the model is told why the entity is asking. An idle guard then costs one decision every 30 seconds at most, or nothing, if it never sees anyone.

## 5. Reuse decisions

Many entities in many sessions face the same situation. The **decision cache** lets the game declare what makes two situations equivalent:

```json
"cache": {
  "key": ["hp_fraction", "sees_player", "world.player_hp_fraction"],
  "buckets": { "hp_fraction": [0.34, 0.67], "world.player_hp_fraction": [0.25, 0.5] },
  "ttl_ms": 10000
}
```

Here health is reduced to three bands and the player's health to three bands, so there are only a few dozen distinct situations per action set. Hundreds of goblins (across every player of the same game version) share those answers. Cached decisions come back with `cached: true`.

The cache is a choice the game controls: it trades individuality (memory, `nearby`, exact numbers are ignored) for cost. Use it for crowds and common enemies, not for story characters.

## 6. Learn local policies

Reports already record context → decision → outcome. Over time this is a dataset. A [local policy](/design/local-policy/) (a small model trained on those decisions and shipped with the game) answers common cases in the game itself and leaves the model for new or high-stakes situations. This part is still a proposal.

## Putting it together

```text
event or refresh_ms timer ──▶ needs a decision?
                                │ no  → native AI
                                ▼
                     group decides instead? ── yes → members follow the parent's intent
                                │ no
                                ▼
                     decision cache hit? ── yes → reuse (cached: true)
                                │ no
                                ▼
                     local policy confident? ── yes → use it          (proposed)
                                │ no
                                ▼
                     within token budget? ── no → native AI (code: budget)
                                │ yes
                                ▼
                     model call: static scopes and profiles first, batched entities
```

See [Deployment, load and offline](/design/deployment/) for the runtime side and [Cost](/design/cost/) for the numbers.
