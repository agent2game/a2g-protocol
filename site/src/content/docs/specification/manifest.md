---
title: Manifest
description: How a game describes its world, scopes, profiles, entity types, observations, events, actions and caching rules.
sidebar:
  order: 2
---

The manifest is the game's self-description. It tells the service what the world is, which kinds of [entities](/glossary/#entity-type) make decisions, what each of them can observe and which actions exist. The service knows nothing about a game beyond its manifest.

Only `entity_types` is required. Everything else is optional, so a small game can start with a few lines and grow into levels, characters and caching without changing protocol version.

## Structure

```json
{
  "world": "Lango is a top-down 2D action RPG. ... Health is given as fractions (0..1). Distances are in pixels.",
  "world_fields": {
    "player_hp_fraction": "number",
    "repellent": "boolean"
  },
  "scopes": {
    "forest": { "text": "Open meadow levels. Bees nest in hives and fight in swarms." },
    "forest_boss": { "parent": "forest", "text": "Boss arena. The boss keeps spawning bees.", "fields": { "boss_phase": [1, 2, 3] } }
  },
  "profiles": {
    "queen_bee": { "type": "boss", "text": "Old and cunning. Protects her hive, retreats to heal rather than die." }
  },
  "entity_types": {
    "bee": {
      "description": "Small, fragile swarm insect (3 HP). Brave in numbers; when badly wounded, alone near the player or among the last of its swarm, it keeps its distance or flees.",
      "fields": {
        "hp_fraction": "number",
        "distance_to_player": "number",
        "sees_player": "boolean",
        "current_action": ["idle", "wander", "chase", "flee"]
      },
      "actions": {
        "chase": "Move toward the player to hit them by contact",
        "flee": "Move directly away from the player to preserve health",
        "idle": "Stop and hold position",
        "wander": "Patrol around the home area without engaging"
      },
      "events": {
        "player_spotted": "The player just came into view",
        "hit": "This bee was just hit by the player"
      },
      "decision_ttl_ms": 12000,
      "refresh_ms": 8000,
      "perception_radius": 120,
      "max_input_tokens": 600,
      "cache": {
        "key": ["hp_fraction", "sees_player", "current_action", "world.player_hp_fraction"],
        "buckets": { "hp_fraction": [0.34, 0.67], "world.player_hp_fraction": [0.25, 0.5] },
        "ttl_ms": 10000
      }
    },
    "player": {
      "description": "The human-controlled hero. Not controlled by A2G.",
      "fields": { "hp_fraction": "number", "action": ["move", "roll", "attack", "transition"] },
      "actions": {},
      "perception_radius": 80
    }
  }
}
```

## Top-level keys

| Key | Meaning | Limits |
| --- | --- | --- |
| `world` | Free text: setting, rules, units. The root of all context | ≤ 4000 chars |
| `world_fields` | Schema of the shared world state sent with every decision | ≤ 24 fields |
| [`scopes`](#scopes) | Named blocks of static context: levels, zones, chapters | ≤ 64 scopes |
| [`profiles`](#profiles) | Named static descriptions of individual characters | ≤ 256 profiles |
| `entity_types` | Kinds of entities; at least one must have actions or decisions | 1–32 types |

## Entity types

| Key | Meaning | Limits |
| --- | --- | --- |
| `description` | Role and character of the type, the main lever on behavior | ≤ 1000 chars |
| `fields` | Schema of what one entity observes ([field types](#field-types)) | ≤ 24 fields |
| `actions` | Action name → description shown to the model. Empty (`{}`) makes the type **observe-only**: reported in telemetry and visible to others, never decided (e.g. the player) | 0–32 actions, ≤ 300 chars each |
| [`decisions`](#decision-slots) | Instead of `actions`: independent choices the entity makes at the same time, each with its own actions | 1 or more slots, no fixed cap |
| `events` | Event name → description. Things that can make an entity ask for a decision now; see [events](#events) | ≤ 16 events, ≤ 300 chars each |
| `decision_ttl_ms` | How long a decision stays valid | 1000–120000, default 12000 |
| `refresh_ms` | How often an SDK should re-ask **without** an event. A hint, not a guarantee | 1000–600000, SDK default |
| `perception_radius` | Distance (in the game's position units) within which this type notices other entities; enables `nearby` and, for observe-only types, `nearby_counts` | > 0 |
| `max_input_tokens` | Budget for the entity-specific part of the model input; see [token budget](#token-budget) | 50–20000 |
| `cache` | Rules for reusing decisions across equivalent situations; see [decision cache](#decision-cache) | n/a |

A type does not have to be a visible object. A **squad**, a **faction** or a level **director** can be an entity type whose actions are high-level intents, with ordinary entities pointing to it as their [`parent`](/specification/decide/#groups). See [Scaling to complex games](/design/scaling/#1-decide-at-the-right-level).

## Decision slots

Some entities make **several independent choices at once**: in one week an employee decides how hard to work, whether to help a colleague and whether to ask for a raise; in one turn a unit picks a move and a target. Squeezing these into one `actions` list changes what can happen in the game: only one of them per decision. Declare them as **decision slots** instead, with `decisions` in place of `actions`:

```json
"employee": {
  "description": "A startup employee.",
  "fields": { "workload": ["light", "sustainable", "overloaded"], "pay_vs_market": ["below", "at", "above"] },
  "decisions": {
    "effort": { "description": "How hard they work this week", "actions": { "carry_on": "Work as usual", "push_harder": "Longer hours", "reduce_effort": "Pull back" } },
    "help":   { "description": "Whether they help the overloaded colleague", "actions": { "none": "Stay on their own work", "help_colleague": "Stay late to help" } },
    "raise":  { "actions": { "none": "Say nothing about pay", "ask_raise": "Ask the CEO for a raise" } }
  }
}
```

- A type has either `actions` or `decisions`, never both. Each slot has its own `actions` (1–32) and an optional `description` (≤ 300 chars).
- A yes/no behaviour is a slot with the action and a `none` option, so the model can choose not to do it.
- There is no cap on the number of slots: declare every independent choice the native AI makes, so AI mode does not change what can happen. A service splits a batch with many questions across several provider calls; the game does not notice.
- Slots are asked together, one provider question per slot, and decided **independently**. In a decide request `legal_actions` names the slots to ask now ([decide](/specification/decide/#decision-slots)); a slot left out stays with the native AI.
- Put behaviours that exclude each other (push harder or slack off) into one slot, and behaviours that can happen together into separate slots.

## Field types

| Type | Accepts | Example |
| --- | --- | --- |
| `"number"` | Finite number | `0.42` |
| `"boolean"` | `true` / `false` | `true` |
| `"string"` | Text up to 80 characters | `"guarding"` |
| `["a", "b", ...]` | One of the listed values (1–32 strings or numbers) | `"chase"` |
| `"vector2"` | `[x, y]` | `[412.5, 188.0]` |
| `"vector3"` | `[x, y, z]` | `[3.0, 0.0, -12.5]` |
| `"entity_ref"` | The id of another entity in the same session | `"72259471404"` |
| `{"list": {...}, "max": N}` | Up to `N` objects, each with exactly the listed sub-fields | see below |

A list describes a bounded collection, nearby allies, visible items, the inventory:

```json
"nearby_allies": {
  "list": { "id": "entity_ref", "hp_fraction": "number", "action": ["idle", "chase", "flee"] },
  "max": 8
}
```

- `max` is 1–32. Sub-fields may use any type except another list.
- **The game decides relevance**: send the 8 nearest allies, not all 300. The adapter is the right place for that filter.
- Every message must send **exactly** the declared fields of each object, no missing, no extra.

Field names (in `world_fields`, `fields`, scope `fields` and list sub-fields) use letters, digits, `_` and `-` only (no dots) so cache keys such as `world.player_hp_fraction` are unambiguous.

## Scopes

A **scope** is a reusable block of static context (a level, a zone, a chapter) sent to the model once per request instead of being repeated for every entity.

```json
"scopes": {
  "forest":      { "text": "Open meadow levels..." },
  "forest_boss": { "parent": "forest", "text": "Boss arena...", "fields": { "boss_phase": [1, 2, 3] } }
}
```

| Key | Meaning | Limits |
| --- | --- | --- |
| `parent` | Another scope this one refines. Chains end at the manifest's `world` | must exist; no cycles |
| `text` | Static description | ≤ 4000 chars |
| `fields` | Schema of dynamic state that only exists in this scope | ≤ 24 fields; names unique along the chain |

A [decide](/specification/decide/#scope) request names the active scope and sends `scope_state` with exactly the fields of the whole chain. The model receives `world` → each scope from root to leaf → the dynamic state.

Scopes can be declared in the manifest or added, replaced and removed later with [`POST /v1/context`](/specification/context/), for example when a level loads.

## Profiles

A **profile** is static text about one character: name, role, history, personality.

```json
"profiles": {
  "queen_bee": { "type": "boss", "text": "Old and cunning. Protects her hive, retreats to heal rather than die." }
}
```

| Key | Meaning | Limits |
| --- | --- | --- |
| `text` | Static description | ≤ 1000 chars |
| `type` | Optional. If set, only entities of this type may use the profile | an entity type declared in the manifest; otherwise the manifest or context update is rejected with `400` |

An entity references a profile by name (`"profile": "queen_bee"`). The text is sent once per request even if several entities share it. Profiles can also be managed with [`POST /v1/context`](/specification/context/).

## Events

`events` lists the reasons an entity may ask for a decision **now**, rather than on its regular `refresh_ms` timer. A decide request may carry a [`trigger`](/specification/decide/#events) naming one of them; the service tells the model what just happened.

Events turn polling into reacting: an idle guard costs nothing until `player_spotted` fires. A type without events is refreshed on its timer only.

## Token budget

`max_input_tokens` caps the **entity-specific** part of the model input: its observation, memory, `nearby`, `members`, `parent`, trigger and question. Shared parts (world, scopes, profiles, world and scope state) are not counted, because they are paid once per batch.

The service estimates tokens before calling the provider (the reference service uses ~4 characters per token). An entity over budget is not sent; it gets a `FALLBACK` decision with `code: "budget"`. A budget is a guard against silently paying for oversized context, not a billing limit. The game sets it per type to its own needs; omit it when no cap is needed. A service SHOULD warn when a type's budget is below the fixed part of its question (instructions, action descriptions, field names), because every decision of that type would then fall back.

## Decision cache

`cache` lets equivalent situations reuse one decision instead of calling the model again.

```json
"cache": {
  "key": ["hp_fraction", "sees_player", "current_action", "world.player_hp_fraction", "scope.boss_phase", "parent.action"],
  "buckets": { "hp_fraction": [0.34, 0.67], "world.player_hp_fraction": [0.25, 0.5] },
  "ttl_ms": 10000
}
```

| Key | Meaning |
| --- | --- |
| `key` | Values that make two situations equivalent: observation fields by name, `world.<field>`, `scope.<field>` and `parent.action`. Allowed field types: `number`, `boolean`, `string` and enums |
| `buckets` | Optional ascending thresholds per numeric key. `[0.34, 0.67]` turns a value into band 0, 1 or 2. Numbers without buckets match exactly |
| `ttl_ms` | How long a cached decision may be reused | 1000–600000, default `decision_ttl_ms` |

Two requests share a cached decision when all of these match:

- the [manifest hash](/glossary/#manifest-hash) and the entity type;
- the scope name and the texts of its chain, the profile and its text, and the trigger;
- the set of `legal_actions`;
- every value in `key`, after bucketing.

The service MUST derive the key from an unambiguous encoding of these parts (for example a hash of their canonical JSON array) so different texts or values can never produce the same key by concatenation.

Everything else (memory, `nearby`, `members`, other fields) is **ignored** by the cache. That is the trade-off the game chooses: individuality for cost. A cache is shared by every session with the same manifest hash, so with many players one model call can serve hundreds of identical goblins. Only trusted (`server`-profile) sessions write to the shared cache; see [shared-cache safety](/specification/security/#shared-cache-safety).

A reused decision is returned with `cached: true` and counts as a normal `AI` decision for memory and reports.

## Manifest hash

The service identifies a manifest by the SHA-256 of its canonical JSON (keys sorted, no insignificant whitespace, UTF-8) **excluding** `scopes` and `profiles`, which may change during a session. It is returned by [`/v1/session`](/specification/session/) and keys the decision cache and, later, [local policies](/design/local-policy/).

## Writing a good manifest

See [Design behavior with the manifest](/guides/behavior/) for measured findings and detailed recommendations on descriptions, fields, rules, events and cache keys. In short:

- Describe units and scales in `world` (fractions, pixels, seconds).
- Put level- and zone-specific rules in scopes, character personality in profiles, and type-wide behavior in `description`.
- The `description` is the main lever on behavior: describe when the type should be cautious as well as aggressive, and the signals it should weigh (health, allies nearby, how many of its kind remain).
- Prefer normalized values (`hp_fraction`) over raw totals so different actors compare.
- Expose only what the entity could plausibly know, and only the nearest few of anything.
- Add `events` and a long `refresh_ms` before reaching for a cache; add a cache before adding hardware.

:::note[Reserved]
Actions may later carry parameters (`"actions": {"move_to": {"description": "...", "params": {...}}}`). This is not part of 0.1.
:::
