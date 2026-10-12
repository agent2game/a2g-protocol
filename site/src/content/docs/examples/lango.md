---
title: Lango (Godot 4)
description: A complete A2G integration in an existing Godot RPG, manifest with scopes, groups, events and cache, adapter, hooks, security profile, messages on the wire and debugging tools.
---

[Lango](https://github.com/Delta12Studio/Lango_GodotRPG) is an open-source top-down 2D action RPG by Delta12Studio. The player explores outdoor levels, caves and a dungeon, and fights bees, bats and a boss that damage by body contact. Its enemies run a classic state machine: `IDLE`, `WANDER`, `CHASE`.

This page shows Lango on the **full A2G protocol 0.1**: what runs today, and how the same integration uses scopes, groups, events, the decision cache and the security model.

:::caution[What runs today]
The running integration now uses 0.1 in the `local` security profile: scopes per level type (the boss arena is added at runtime with `/v1/context`), the `queen_bee` profile, bees spawned by the boss as her group, `hit` / `player_spotted` / `player_lost` events, token budgets and a decision cache for bees. Sections marked **Target** still describe the `client` security profile, which is specified but not yet implemented in the [reference service and Godot SDK](/implementations/service/#implementation-status); details such as scope texts may differ from the running manifest.

The upstream repository is the original **Godot 3** game. The Godot 4 conversion and all A2G code exist only in a local working copy and are **not yet published**.
:::

![Lango with the A2G debug overlay: six bees under AI control](/images/lango-overlay.png)

## At a glance

| Concern | Today | Target on full 0.1 |
| --- | --- | --- |
| Entities | `bee`, `bat`, `boss` decide; `player` is observe-only | Same, plus bees spawned by the boss belong to it as a **group** |
| Context | One world text, sent with every request | **Scopes** per area: `outdoors`, `caves`, `dungeon`, `boss_arena` |
| When to ask | Timer: 3 s if the player is seen, 8 s otherwise; early on a value change | **Events** `player_spotted`, `hit`, `ally_died`; `refresh_ms` 8000 |
| Repeated situations | Every bee asks the model | **Decision cache** for bees: equivalent situations share an answer |
| Oversized input | Not checked | **Token budget** of 700 per entity |
| Security | `local` profile: service on `127.0.0.1`, no authentication | `local` for development; `client` profile with join tokens, or a shipped [local policy](/design/local-policy/), for release |
| Reports | Matched by action | Carry **`decision_id`** |

## What was changed in the game

| File | Kind | Purpose |
| --- | --- | --- |
| `a2g_manifest.json` | new | World, area scopes, entity types, events, cache rules |
| `A2G/A2GClient.gd` | new, SDK | The [Godot SDK](/implementations/godot-sdk/), autoload `A2G`, no Lango-specific code |
| `A2G/LangoA2G.gd` | new, adapter | All Lango-specific glue, autoload `LangoA2G` (~100 lines) |
| `Enemies/Enemy.gd`, `Bee.gd`, `Boss.gd` | changed | Register with A2G and ask it first; target: two `notify` calls for events |
| `project.godot` | changed | Two autoloads |
| `Debug/DebugOverlay.gd` | new, optional | In-game debug panel and enemy labels |

The original state machine was not removed or rewritten. A `FLEE` state exists only while A2G controls an enemy.

## 1. Manifest

**Target**: the manifest Lango uses on full 0.1. Fields and actions are those of the running game; scopes, groups, events, budget and cache are the additions.

```json title="a2g_manifest.json"
{
  "world": "Lango is a top-down 2D action RPG. The player fights with melee weapons or a ranged form. Hostile creatures damage the player only by body contact. The player can drink a repellent that hides them from enemies. Health is given as fractions (0..1). Distances are in pixels.",
  "world_fields": { "player_hp_fraction": "number", "repellent": "boolean" },

  "scopes": {
    "outdoors":   { "text": "Open outdoor levels with room to retreat and regroup." },
    "caves":      { "text": "Narrow cave levels. Little room to flee; enemies meet the player at close range." },
    "dungeon":    { "text": "Dungeon rooms connected by corridors." },
    "boss_arena": { "parent": "dungeon", "text": "The boss room. The boss keeps spawning bees while it lives.",
                    "fields": { "boss_hp_fraction": "number" } }
  },

  "entity_types": {
    "bee": {
      "description": "Small, fragile swarm insect (3 HP). Brave in numbers; when badly wounded, alone near the player or among the last of its swarm, it keeps its distance or flees. Bees spawned by the boss follow its lead.",
      "fields": {
        "hp_fraction": "number", "distance_to_player": "number", "sees_player": "boolean",
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
        "hit": "This creature was just hit by the player",
        "ally_died": "A creature nearby was just killed"
      },
      "decision_ttl_ms": 12000,
      "refresh_ms": 8000,
      "perception_radius": 120,
      "max_input_tokens": 700,
      "cache": {
        "key": ["hp_fraction", "sees_player", "current_action", "world.player_hp_fraction", "parent.action"],
        "buckets": { "hp_fraction": [0.34, 0.67], "world.player_hp_fraction": [0.25, 0.5] },
        "ttl_ms": 8000
      }
    },
    "bat":  { "description": "Agile cave hunter (6 HP). Opportunistic: attacks when the player is weakened or busy with other creatures; backs off when wounded and alone.", "...": "fields, actions, events as for bee; no cache" },
    "boss": { "description": "Large, tough guardian (50 HP) that keeps spawning bees. Aggressive while its bees are near the player; retreats briefly to recover when very low on health.", "...": "fields, actions, events as for bee; perception_radius 160" },
    "player": {
      "description": "The human-controlled hero. Not controlled by A2G.",
      "fields": { "hp_fraction": "number", "action": ["move", "roll", "attack", "transition"] },
      "actions": {},
      "perception_radius": 80
    }
  }
}
```

Why these choices:

- **Scopes, not a longer world text.** Areas differ in space to manoeuvre; each request carries only the active area.
- **The boss as a group.** Spawned bees name the boss as `parent`, so they see "the boss chose to retreat" and the boss sees its brood as `members`.
- **Events and a slow timer.** Bees far from the player stop asking every few seconds; a hit or a spotted player asks at once.
- **A cache for bees only.** Bees are many and alike; three health bands × visibility × current action × player health × boss intent is a few hundred situations. Bats and the boss stay individual.

## 2. Adapter

`LangoA2G.gd` is the only Lango-specific A2G code. Today:

```gdscript title="A2G/LangoA2G.gd (running today)"
const ACTIONS = ["idle", "wander", "chase", "flee"]  # index == enemy.state

func _ready():
	A2G.world_provider = world
	for type in ["bee", "bat", "boss"]:
		A2G.register_adapter(type, self)
	A2G.register_adapter("player", PlayerAdapter.new())  # observe-only

func world() -> Dictionary:
	return {"player_hp_fraction": snappedf(Global.health / Global.max_health, 0.001), "repellent": Global.repellent}

func observe(enemy) -> Dictionary:
	return {
		"hp_fraction": snappedf(enemy.HEALTH / enemy.get_meta("a2g_max_health", 1.0), 0.001),
		"distance_to_player": snappedf(enemy.global_position.distance_to(player.global_position), 0.1),
		"sees_player": sees_player(enemy),
		"current_action": ACTIONS[enemy.state],
	}

# Game rule: an enemy that cannot see the player may not chase or flee.
func legal_actions(enemy) -> Array:
	return ACTIONS.duplicate() if sees_player(enemy) else ["idle", "wander"]

func position(enemy) -> Vector2:
	return enemy.global_position

func execute(enemy, action: String, delta: float) -> bool:
	if action in ["chase", "flee"] and not sees_player(enemy):
		action = "idle"          # the player vanished since the decision: do something safe
		executed = false         # and report the decision as blocked
	# idle / wander / chase / flee reuse the enemy's own movement helpers
	...
	return executed
```

**Target** additions: a few lines:

```gdscript title="A2G/LangoA2G.gd (target additions)"
const AREAS = {"Level": "outdoors", "CaveLevel": "caves", "Dangeon": "dungeon", "Boss": "boss_arena"}

func _ready():
	...
	A2G.scope_provider = area_scope   # active scope and its state, read on every decide

func area_scope() -> Dictionary:
	var scene = get_tree().current_scene.name
	for prefix in AREAS:
		if scene.begins_with(prefix):
			var state = {"boss_hp_fraction": boss_hp()} if AREAS[prefix] == "boss_arena" else {}
			return {"scope": AREAS[prefix], "scope_state": state}
	return {}

# Bees spawned by the boss belong to it.
func parent(enemy) -> Node:
	return enemy.get_meta("spawned_by", null)
```

## 3. Hooks in enemy scripts

```gdscript title="Enemies/Enemy.gd (same in Bee.gd and Boss.gd)"
func _ready():
	LangoA2G.track(self)          # picks bee / bat / boss and calls A2G.track
	...

func _physics_process(delta):
	# knockback and repellent handling stay first, unchanged
	...
	if A2G.execute(self, delta):  # A2G controls this enemy this frame
		return
	match state:                  # original state machine, unchanged
		IDLE: ...
```

**Target**: events are one call where the game already reacts:

```gdscript
func _on_HurtBox_area_entered(area):
	...                            # existing damage code
	A2G.notify(self, "hit")

func seek_player():
	if playerDetectionZone.can_see_player() and not was_seeing_player:
		A2G.notify(self, "player_spotted")
	...
```

In `Boss.gd`, a spawned bee gets `bee.set_meta("spawned_by", self)`.

## 4. Security

Lango is single-player and has no game server, so its threats are simple: the player can always change their own game, and nothing they do may reach other players, the shared cache or the provider bill. See [Security](/specification/security/).

| Phase | Profile | What protects what |
| --- | --- | --- |
| Development (today) | `local` | Service bound to `127.0.0.1`; the OpenAI key lives only in `a2g-poc/.env`; the game holds no secret |
| Release with live decisions (target) | `client` | The studio backend issues a 15-minute join token per player; the service accepts only Lango's registered manifest hash; session tokens on every request; `decision_id` on reports; bees' cache entries from players stay in their own session; rate limits per player |
| Release offline (target) | none | A [local policy](/design/local-policy/) trained on playtest decisions ships in the build; no service, no network, no key |

What Lango sends is free of personal data by construction: health fractions, distances, visibility, enum actions and positions. The player's name is never sent. All strings are enums, so there is no free text a player could use for prompt injection.

If Lango gained online co-op, the host or a dedicated server would run the SDK in the `server` profile and replicate enemy behavior; clients would never call `/v1/decide`.

## 5. Messages on the wire

**Target** shapes on full 0.1, `client` profile. Observations and timings are modelled on a running session; tokens, hashes and ids are illustrative and shortened.

**Session**: the game first gets a join token from the studio backend:

```http
POST /v1/session
Authorization: Bearer eyJhbGciOiJFZERTQSJ9…   ← join token: game "lango", manifest hash, pseudonymous player, exp 15 min
```

```json
{ "a2g": "0.1", "client_id": "48213-90412377", "game": "Lango", "engine": "Godot 4.7.2-stable (official)", "manifest": { "...": "above" } }
```

```json
{ "a2g": "0.1", "ok": true, "manifest_hash": "sha256:5c1e…", "session_token": "s_7Hq…", "expires_in": 3600 }
```

**Decide**: in the boss room, a bee was just hit; it belongs to the boss:

```http
POST /v1/decide
Authorization: Bearer s_7Hq…
```

```json
{
  "client_id": "48213-90412377",
  "epoch": 1,
  "world": { "player_hp_fraction": 0.8, "repellent": false },
  "scope": "boss_arena",
  "scope_state": { "boss_hp_fraction": 0.62 },
  "entities": [
    {
      "id": "72259471404", "type": "bee", "parent": "71005", "trigger": "hit",
      "observation": { "hp_fraction": 0.667, "distance_to_player": 38.2, "sees_player": true, "current_action": "chase" },
      "legal_actions": ["idle", "wander", "chase", "flee"],
      "position": [412.5, 188.0]
    },
    {
      "id": "74356623529", "type": "bee", "parent": "71005",
      "observation": { "hp_fraction": 1.0, "distance_to_player": 104.9, "sees_player": true, "current_action": "chase" },
      "legal_actions": ["idle", "wander", "chase", "flee"]
    }
  ]
}
```

**Decide response**: the second bee's situation was already answered for another bee, so it comes from the cache:

```json
{
  "a2g": "0.1",
  "epoch": 1,
  "latency_ms": 233,
  "decisions": [
    { "id": "72259471404", "source": "AI", "action": "flee", "label": "Move directly away from the player to preserve health",
      "confidence": 0.64, "ttl_ms": 12000, "decision_id": "d_01J9Z4K7" },
    { "id": "74356623529", "source": "AI", "action": "chase", "label": "Move toward the player to hit them by contact",
      "confidence": 0.7, "ttl_ms": 12000, "decision_id": "d_01J9Z4K8", "cached": true }
  ]
}
```

**Report**: when the first decision ended:

```json
{
  "client_id": "48213-90412377",
  "entity_id": "72259471404",
  "decision_id": "d_01J9Z4K7",
  "action": "flee",
  "status": "executed",
  "outcome": { "distance_to_player_delta": 96.4, "hp_fraction_delta": 0, "world_player_hp_fraction_delta": 0, "seconds": 4.1 }
}
```

**Context**: not needed for Lango's fixed areas, which are all in the manifest. A game with generated levels would send [`/v1/context`](/specification/context/) when one loads.

**Telemetry**: every second, with the active scope and each bee's `parent`, so the boss sees all its brood, not only those in the current batch.

## 6. Debugging tools

**In-game overlay** (backtick/tilde): FSM / AI switch, per-enemy cards with HP, actual state, chosen action, latency, confidence and the action description, and a banner with AI/fallback counts and the age of the last provider reply. Debug-only options: infinite player HP and a damage multiplier.

**Service console** at `http://127.0.0.1:8787/`: clients, the manifest, entities with their fields as columns, the current decision, the entity's memory and filtered logs.

![Service console: entities, current decision, memory and logs](/images/lango-console.jpg)

## Result

Today the full core loop (manifest → batched observations → typed choice → validated action → reported outcome → memory) works in a real game, and switching back to FSM restores the original behavior.

The target version adds per-area context, boss-led groups, event-driven requests, a shared cache for bees and a release-ready security profile, without changing the game's state machine.

Not shown yet: that AI decisions make better enemies than the original FSM, and that a second game integrates with similar effort.
