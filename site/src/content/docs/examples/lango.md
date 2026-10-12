---
title: Lango (Godot 4)
description: A complete A2G integration in an existing Godot RPG, with scopes, profiles, groups, events, a decision cache, the adapter, hooks, messages on the wire, measured behavior and debugging tools.
---

[Lango](https://github.com/Delta12Studio/Lango_GodotRPG) is an open-source top-down 2D action RPG by Delta12Studio. The player explores outdoor levels, caves and a dungeon, and fights bees, bats and a boss that damage by body contact. Its enemies run a classic state machine: `IDLE`, `WANDER`, `CHASE`.

**Source:** [github.com/agent2game/a2g-example-lango-godot](https://github.com/agent2game/a2g-example-lango-godot), a fork of the original game. Its `main` branch is the Godot 4 version with A2G; the untouched Godot 3 original is in the `godot3` branch.

This page shows Lango running on A2G protocol 0.1 with the [Godot SDK](/implementations/godot-sdk/) and the [reference service](/implementations/service/) in the `local` [deployment profile](/glossary/#deployment-profile).

:::caution[Status]
Everything on this page runs today, except the `client` security profile in [Security](#4-security), which is specified but not yet implemented. The reference service is not public yet, so running the example with live decisions needs your own A2G decision service; without one the game plays on its native AI.
:::

![Lango with the A2G debug overlay: bees under AI control, the chosen action, confidence and the A2G service status](/images/lango-overlay.png)

## At a glance

| Concern | How Lango uses A2G |
| --- | --- |
| Entities | `bee`, `bat`, `boss` decide; the `player` is observe-only (reported, never decided) |
| Context | One `world` text plus [scopes](/glossary/#scope) `overworld`, `caves`, `dungeon`; `boss_arena` is added at runtime with `/v1/context` |
| Characters | The boss uses the [profile](/glossary/#profile) `queen_bee` |
| Groups | Bees spawned by the boss name it as `parent`; the boss sees them as `members` |
| When to ask | [Events](/glossary/#event) `hit`, `player_spotted`, `player_lost`, `allies_gathered`; otherwise every 3 s while the player is seen, 8 s otherwise |
| Repeated situations | A [decision cache](/glossary/#decision-cache) for bees; decisions below confidence 0.5 are not cached |
| Input size | A [token budget](/glossary/#token-budget) of 1500 per entity |
| Security | `local`: service on `127.0.0.1`, the OpenAI key only in the service's `.env` |

## What was changed in the game

| File | Kind | Purpose |
| --- | --- | --- |
| `a2g_manifest.json` | new | World, scopes, profile, entity types, events, cache rules |
| `addons/a2g/` | new, SDK | The [Godot SDK](/implementations/godot-sdk/) `v0.1.1`, vendored unchanged; autoload `A2G`, no Lango-specific code. `scripts/update-a2g-sdk.sh <tag>` updates it |
| `A2G/LangoA2G.gd` | new, adapter | All Lango-specific glue, autoload `LangoA2G` (about 180 lines) |
| `Enemies/Enemy.gd`, `Bee.gd`, `Boss.gd` | changed | `LangoA2G.track(self)` in `_ready`, `A2G.execute(self, delta)` before the state machine |
| `Enemies/Boss.gd` | changed | One line: spawned bees join the boss's group |
| `project.godot` | changed | Two autoloads |
| `Debug/DebugOverlay.gd`, `Debug/tests/` | new, optional | In-game debug panel and enemy labels; scene and live behavior tests |

The original state machine was not removed or rewritten. A `FLEE` state exists only while A2G controls an enemy, and A2G-driven movement is kept inside the level's camera limits like the player's.

## 1. Manifest

The running manifest (bat and boss shortened; their fields, actions and events match the bee's, without a cache):

```json title="a2g_manifest.json"
{
  "world": "Lango is a top-down 2D action RPG. The player explores levels and fights with melee weapons or a ranged form. Hostile creatures (bees, bats and bosses) damage the player only by body contact; they have no ranged attacks. The player can drink a repellent that hides them from enemies. Health is given as fractions (0..1) so actors with different maximum HP can be compared. Distances are in pixels.",
  "world_fields": { "player_hp_fraction": "number", "repellent": "boolean" },

  "scopes": {
    "overworld": { "text": "Open outdoor levels: meadows, paths and villages. Creatures have room to retreat, regroup and return to their home area." },
    "caves":     { "text": "Narrow, dark caves where bats live. Corridors are tight, so fleeing creatures get cornered quickly." },
    "dungeon":   { "text": "Dungeon rooms connected by corridors. Creatures here guard their rooms rather than wandering far." }
  },
  "profiles": {
    "queen_bee": { "type": "boss", "text": "The queen of the hive: old, cunning and protective of her swarm. She lets her bees take the first hits and retreats to recover rather than die." }
  },

  "entity_types": {
    "bee": {
      "description": "Small, fragile swarm insect: 3 HP, one player hit removes a third (hp_fraction 1.0, 0.667, 0.333); each contact costs the player one heart. allies_near_player counts other bees fighting the player (within 140 px of the player). Only those count: ignore bees elsewhere in the level and earlier decisions; re-check the rules every time. Rules, first match wins, for a bee that sees the player: 1) Player at 0.4 HP or less: attack. 2) Bee at full HP: attack, even alone. 3) Player above 0.6 HP: a bee at 0.667 attacks only with allies_near_player 1 or more, a bee at 0.333 only with 2 or more; otherwise it keeps its distance or flees. 4) Otherwise a wounded bee attacks with allies_near_player 1 or more, else keeps its distance or flees.",
      "fields": {
        "hp_fraction": "number", "distance_to_player": "number", "sees_player": "boolean",
        "current_action": ["idle", "wander", "chase", "flee"],
        "allies_near": "number", "allies_near_player": "number"
      },
      "actions": {
        "chase": "Move toward the player to hit them by contact",
        "flee": "Move directly away from the player to preserve health",
        "idle": "Stop and hold position",
        "wander": "Patrol around the home area without engaging"
      },
      "events": {
        "player_spotted": "The player just came into view",
        "player_lost": "The player just went out of view",
        "hit": "This creature was just hit by the player",
        "allies_gathered": "Other bees just gathered around this bee (allies_near rose to 2 or more)"
      },
      "decision_ttl_ms": 12000,
      "refresh_ms": 8000,
      "perception_radius": 120,
      "max_input_tokens": 1500,
      "cache": {
        "key": ["hp_fraction", "distance_to_player", "sees_player", "allies_near", "allies_near_player", "world.player_hp_fraction", "parent.action"],
        "buckets": {
          "hp_fraction": [0.34, 0.67], "distance_to_player": [40, 80, 140], "allies_near": [1, 3],
          "allies_near_player": [1, 2], "world.player_hp_fraction": [0.25, 0.5]
        },
        "ttl_ms": 10000
      }
    },
    "bat":  { "description": "Agile cave hunter (6 HP). Opportunistic: attacks when the player is weakened or busy with other creatures. Backs off when wounded and facing the player alone, or when the player has already killed most creatures in the level. ...", "...": "as bee, events without allies_gathered, no cache" },
    "boss": { "description": "Large, tough guardian (50 HP) that keeps spawning bees. Aggressive while its bees are near the player; retreats briefly to recover when very low on health.", "...": "as bee without the ally fields; perception_radius 160" },
    "player": {
      "description": "The human-controlled hero. Not controlled by A2G; reported so creatures know where it is, how healthy it is and what it is doing.",
      "fields": { "hp_fraction": "number", "action": ["move", "roll", "attack", "transition"] },
      "actions": {},
      "perception_radius": 140
    }
  }
}
```

The boss arena is not in the manifest. The adapter adds it with `/v1/context` when the boss level loads:

```json
{ "boss_arena": { "parent": "dungeon", "text": "The queen's throne room: a closed arena with no exit until the boss dies. She keeps spawning bees that defend her.", "fields": { "boss_phase": [1, 2, 3] } } }
```

Why these choices:

- **Scopes, not a longer world text.** Areas differ in space to manoeuvre; each request carries only the active area.
- **The boss as a group.** Spawned bees name the boss as `parent`, so they see her latest decision, and the boss sees her brood as `members`.
- **Events and a slow timer.** Bees that do not see the player ask every 8 s; a hit, a spotted or lost player, or allies arriving ask at once.
- **`allies_near_player`.** Allies are counted around the player, the target of the decision, not only around the bee: two bees flanking the player are far from each other but fight together. See [Design behavior with the manifest](/guides/behavior/#5-give-signals-relative-to-what-matters).
- **A cache for bees only, keyed on everything the rules use.** Bees are many and alike; bats and the boss stay individual.

The bee description went through several versions. What we measured on the way, and how to write descriptions and fields, is on [Design behavior with the manifest](/guides/behavior/).

## 2. Adapter

`LangoA2G.gd` is the only Lango-specific A2G code. It reports what the game knows and executes what the model chose:

```gdscript title="A2G/LangoA2G.gd (excerpt)"
const ACTIONS = ["idle", "wander", "chase", "flee"]  # index == enemy.state

func _ready():
	A2G.world_provider = world
	A2G.scope_provider = scope
	for type in ["bee", "bat", "boss"]:
		A2G.register_adapter(type, self)
	A2G.register_adapter("player", PlayerAdapter.new())  # observe-only

## Active scope from the current scene; the boss arena is registered at runtime.
func scope() -> Dictionary:
	var name = str(get_tree().current_scene.name)
	if name == "Boss":
		if not A2G.context_updates.scopes.has("boss_arena"):
			A2G.update_context({"boss_arena": BOSS_ARENA})
		if not A2G.scope_ready("boss_arena"):
			return {"scope": "dungeon"}
		return {"scope": "boss_arena", "state": {"boss_phase": boss_phase()}}
	if name.begins_with("CaveLevel"):
		return {"scope": "caves"}
	...

## Lango's own perception: the detection zone, hidden by the repellent. Not widened for the model.
func aware_of_player(enemy) -> bool:
	return is_instance_valid(enemy.playerDetectionZone.player) and not Global.repellent

func observe(enemy) -> Dictionary:
	return {
		"hp_fraction": snappedf(enemy.HEALTH / enemy.get_meta("a2g_max_health", 1.0), 0.001),
		"distance_to_player": snappedf(enemy.global_position.distance_to(player.global_position), 0.1),
		"sees_player": aware_of_player(enemy),
		"current_action": ACTIONS[enemy.state],
		"allies_near": allies_near(enemy),               # same type within 120 px of this enemy
		"allies_near_player": allies_near_player(enemy), # same type within 140 px of the player
	}

# Game rule: an enemy that cannot see the player may not chase or flee.
func legal_actions(enemy) -> Array:
	return ACTIONS.duplicate() if aware_of_player(enemy) else ["idle", "wander"]

## Manifest events from changes since the last check.
func trigger(enemy) -> String:
	var now = [enemy.HEALTH, aware_of_player(enemy), allies_near(enemy)]
	var before = enemy.get_meta("lango_a2g_last", now)
	enemy.set_meta("lango_a2g_last", now)
	if now[0] < before[0]: return "hit"
	if now[1] and not before[1]: return "player_spotted"
	if before[1] and not now[1]: return "player_lost"
	if now[2] >= 2 and before[2] < 2: return "allies_gathered"
	return ""

func execute(enemy, action: String, delta: float) -> bool:
	if action in ["chase", "flee"] and not aware_of_player(enemy):
		action = "idle"       # the player vanished since the decision: do something safe
		executed = false      # and report the decision as blocked
	# idle / wander / chase / flee reuse the enemy's own movement helpers
	...
	enemy.move_and_slide()
	keep_on_screen(enemy)     # same camera limits as the player
	return executed
```

## 3. Hooks in enemy scripts

```gdscript title="Enemies/Enemy.gd (same in Bee.gd and Boss.gd)"
func _ready():
	LangoA2G.track(self)          # picks bee / bat / boss (the boss with profile "queen_bee")
	...

func _physics_process(delta):
	# knockback and repellent handling stay first, unchanged
	...
	if A2G.execute(self, delta):  # A2G controls this enemy this frame
		return
	match state:                  # original state machine, unchanged
		IDLE: ...
```

```gdscript title="Enemies/Boss.gd"
func _on_Timer_timeout():
	var bee = Bee.instantiate()
	get_parent().add_child(bee)
	bee.position = position
	LangoA2G.link(bee, self)      # the new bee joins the boss's group
```

## 4. Security

Lango is single-player and has no game server: the player can always change their own game, and nothing they do may reach other players, the shared cache or the provider bill. See [Security](/specification/security/).

| Phase | Profile | What protects what |
| --- | --- | --- |
| Development (today) | `local` | Service bound to `127.0.0.1` with `Host`, `Origin` and `Content-Type` checks; the OpenAI key lives only in the service's `.env`; the game holds no secret; reports must carry a `decision_id` |
| Release with live decisions (not implemented) | `client` | The studio backend issues a 15-minute join token per player; the service accepts only Lango's registered manifest hash; session tokens on every request; player cache entries stay in their own session; rate limits per player |
| Release offline (proposed) | none | A [local policy](/design/local-policy/) trained on playtest decisions ships in the build; no service, no network, no key |

What Lango sends is free of personal data by construction: health fractions, distances, counts, visibility, enum actions and positions. All strings are enums, so there is no free text a player could use for prompt injection.

## 5. Messages on the wire

Messages from a running session in the `local` profile.

**Session** response:

```json
{ "a2g": "0.1", "ok": true, "manifest_hash": "sha256:c5a570ba0dbed11b643ce4cce0f51b027b4794a44633be538da1b8f5e028186b" }
```

**Context**: when the boss level loads (sent by the adapter, see above):

```json
{ "client_id": "12752-87820-2479102308", "scopes": { "boss_arena": { "parent": "dungeon", "text": "The queen's throne room: ...", "fields": { "boss_phase": [1, 2, 3] } } } }
```

```json
{ "ok": true, "scopes": 4, "profiles": 1 }
```

**Decide**: in the boss arena, a bee spawned by the boss (its `parent`) asks because allies just gathered around it. It is 308 px from the player and does not see her, so the game offers only `idle` and `wander`:

```json
{
  "client_id": "12752-87820-2479102308",
  "epoch": 1,
  "world": { "player_hp_fraction": 0.6, "repellent": false },
  "scope": "boss_arena",
  "scope_state": { "boss_phase": 1 },
  "entities": [
    {
      "id": "131583708355", "type": "bee", "parent": "79473674387", "trigger": "allies_gathered",
      "observation": { "hp_fraction": 1.0, "distance_to_player": 307.8, "sees_player": false, "current_action": "wander",
                       "allies_near": 2, "allies_near_player": 6 },
      "legal_actions": ["idle", "wander"],
      "position": [36.6, -103.7]
    }
  ]
}
```

**Decide response**: a low-confidence choice (0.02), which the service returns but does not cache:

```json
{
  "a2g": "0.1",
  "epoch": 1,
  "latency_ms": 164,
  "decisions": [
    { "id": "131583708355", "source": "AI", "action": "idle", "label": "Stop and hold position",
      "confidence": 0.02, "ttl_ms": 12000, "decision_id": "d_56891654ac5b59b5" }
  ]
}
```

A decision reused from the cache for an equivalent bee in the same session looks like this:

```json
{ "id": "192568888907", "source": "AI", "action": "idle", "label": "Stop and hold position",
  "confidence": 0.82, "ttl_ms": 12000, "decision_id": "d_d50997a8cb53e9d6", "cached": true }
```

**Report**: when a decision of the same bee ended (numeric deltas of the observation and the world, as the SDK reports them):

```json
{
  "client_id": "12752-87820-2479102308",
  "entity_id": "131583708355",
  "decision_id": "d_39ac87c61135098f",
  "action": "wander",
  "status": "executed",
  "outcome": { "allies_near_delta": 4, "allies_near_player_delta": 0, "distance_to_player_delta": -16.4,
               "hp_fraction_delta": 0, "world_player_hp_fraction_delta": 0, "seconds": 0.7 }
}
```

In this session (boss arena, about two minutes, the boss spawning bees) the service made 529 decisions in 50 provider calls; 360 of them (68%) came from the cache, none fell back.

**Telemetry**: every second, also in native mode and while paused, with the active scope, each entity's position, `parent` and `profile`, and the player as an observe-only entity.

## 6. Measured behavior

`Debug/tests/test_situation_behavior.gd` sets up situations in the real game and records the decision, three runs each, with the manifest above:

| Situation | Expected | Result |
| --- | --- | --- |
| A: six healthy bees near the player | chase | chase 3/3 (0.93 to 0.97) |
| F: one healthy bee alone, 60 px away | chase | chase 3/3 (0.52 to 0.6) |
| B: the last bee, one hit from death | flee | flee 3/3 (0.6 to 0.81) |
| D: two wounded bees around a player with 2 of 5 hearts | chase | chase in 4 of 6 bee decisions |
| C: three wounded bees together, healthy player | chase | flee 3/3, low confidence (0.09 to 0.15) |
| E: two wounded bees, healthy player | the bee at 0.333 flees | both chase |

The defaults are reliable; the intermediate rules (C, E) are not followed reliably yet. In C the bees' memory says that chasing cost them two thirds of their health, which outweighs the rule. This is the open problem described in [Design behavior with the manifest](/guides/behavior/#3-keep-rules-few-and-simple); the next step is a scenario set to iterate the description against.

## 7. Debugging tools

**In-game overlay** (backtick or tilde): native/AI switch, per-enemy cards with HP, the actual state, the chosen action, latency, confidence and the action description (marked when cached or with a fallback code), and a banner with AI and fallback counts, the A2G session state and the age of the last provider reply. Debug-only options: infinite player HP and a damage multiplier.

**Agent2Game Console** at `http://127.0.0.1:8787/`:

![Agent2Game Console overview: control mode, active scope, cache hits, provider calls, fallbacks by code, cost, population and world state](/images/lango-console-overview.png)

![Agent2Game Console entities: profile, parent, game state, AI choice, cache and trigger per entity; the boss card shows its profile, token budget and group members](/images/lango-console-entities.png)

![Agent2Game Console context: world text, the queen_bee profile and the scope tree with boss_arena active under dungeon](/images/lango-console-context.png)

## 8. Run it

```sh
cd a2g-poc && python3 decision_service.py      # needs OPENAI_API_KEY in .env
godot --path examples/Lango_GodotRPG res://Levels/Level1.tscn -- --a2g-ai
```

Open the Agent2Game Console, play, and press backtick for the overlay. Checks used during development:

```sh
python3 -m unittest discover -s tests -v                                  # service (mocked provider, schema conformance)
godot --headless --path . --script res://Debug/tests/test_a2g_client.gd   # SDK and adapter, offline
godot --headless --path . --script res://Debug/tests/test_situation_behavior.gd   # live, billable: scenarios above
```

## Result

The full loop runs in a real game: manifest, scoped context, batched observations, typed choices, validated actions, reported outcomes, memory, groups, events and a cache, with native AI as the fallback at every step. Switching back to native mode restores the original game.

Not shown yet: that AI decisions make better enemies than the original state machine, that intermediate tactical rules can be made reliable, and that a second game integrates with similar effort.
