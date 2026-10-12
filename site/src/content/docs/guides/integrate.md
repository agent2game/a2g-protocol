---
title: Integrate a game
description: The steps to connect an existing game to A2G, manifest, adapter and hooks.
---

This guide uses the [Godot SDK](/implementations/godot-sdk/). The steps are the same for any engine.

## 0. Find or write the client

Check [Implementations](/implementations/godot-sdk/) for an SDK for your engine. If there is one, use it and continue with step 1.

### No SDK for your engine

Write a small client in your engine's language. It is the same for every game, so keep it separate from game code, one module that the adapter plugs into. It must follow these rules:

| Area | Rule |
| --- | --- |
| Separation | Engine-specific but **game-agnostic**: no references to your game's classes. Everything game-specific lives in the adapter and the manifest |
| Threads and frames | Never block a frame on the network. Requests are asynchronous; at most a few in flight |
| Session | Load the manifest from a file, open [`/v1/session`](/specification/session/), keep the `session_token`, reopen on `401`/`409` |
| Decide | Batch up to 16 entities that need a decision (timer, [event](/specification/manifest/#events) or changed values) into one [`/v1/decide`](/specification/decide/) |
| Validation | Drop replies with an old `epoch`; accept an action only if it is in the `legal_actions` you sent; expire it after `ttl_ms` |
| Fallback | On any error, timeout, non-`200`, `FALLBACK` or expired decision, run the game's **existing AI**. The client never invents an action |
| Report | When a decision ends, send [`/v1/report`](/specification/report/) with its `decision_id`, status and a few numeric outcomes |
| Telemetry | About once per second, in every mode, send [`/v1/telemetry`](/specification/telemetry/) with each entity's actual state |
| Modes | Start in native mode; AI control is switched on explicitly and switching modes increments the epoch |
| Security | No provider keys in the build; the session token on every request; no personal data in observations ([Security](/specification/security/)) |
| Correctness | Validate your messages against the [JSON Schema](https://agent2game.org/schema/0.1/a2g.schema.json) in tests, and test with the service stopped: the game must play normally |

The public surface mirrors the [Godot SDK](/implementations/godot-sdk/#api): `register_adapter`, `track`, `execute(entity, delta) -> bool`, `set_ai_enabled`, `notify(entity, event)`. Keeping the same names makes the manifest, adapter and documentation portable between engines.

## 1. Choose entities and actions

Pick the kind of entity whose behavior you want the model to drive: enemies, NPCs, units. List the actions your game **already knows how to execute** for them, such as `chase`, `flee`, `idle`, `wander`. A2G does not add new abilities; it chooses between existing ones.

## 2. Write the manifest

Create `a2g_manifest.json` describing the world, each entity type, what it observes and its actions. See [Manifest](/specification/manifest/) for the format.

Tips:

- Use normalized values (`hp_fraction` instead of raw HP) and state units in the world text.
- Put personality in the type `description`, mechanics in action descriptions.
- Expose only what the entity could plausibly know.

## 3. Write the adapter

One object implementing `observe`, `legal_actions` and `execute` for your types, and providing the world state:

```gdscript
extends Node

func _ready():
	A2G.world_provider = func(): return {"player_hp_fraction": Global.health / Global.max_health}
	A2G.register_adapter("guard", self)

func observe(guard) -> Dictionary:
	return {"hp_fraction": guard.hp / guard.max_hp, "sees_player": guard.sees_player()}

func legal_actions(guard) -> Array:
	return ["patrol", "attack", "retreat"] if guard.sees_player() else ["patrol"]

func execute(guard, action: String, delta: float) -> bool:
	match action:
		"patrol": guard.patrol(delta)
		"attack": guard.attack(delta)
		"retreat": guard.retreat(delta)
	return true
```

`legal_actions` is where your game rules live: never offer an action that cannot be executed right now.

## 4. Hook the entities

Two lines in each entity script:

```gdscript
func _ready():
	A2G.track(self, "guard")

func _physics_process(delta):
	if A2G.execute(self, delta):
		return
	# original AI below, unchanged
```

## 5. Run and observe

1. Start the [decision service](/implementations/service/).
2. Run the game and switch AI mode on (`A2G.set_ai_enabled(true)` or the `--a2g-ai` flag).
3. Open the Agent2Game Console at `http://127.0.0.1:8787/` and check that decisions are `AI`, actions match executed states and reports arrive.

Switch AI mode off to return to the original behavior at any time.

## 6. Scale up

When the game grows beyond a few enemies, add what it needs, one tool at a time: [events](/specification/manifest/#events) and a long `refresh_ms`, [scopes](/specification/manifest/#scopes) for levels, [profiles](/specification/manifest/#profiles) for named characters, [groups](/specification/decide/#groups) for squads and the [decision cache](/specification/manifest/#decision-cache) for crowds. See [Scaling to complex games](/design/scaling/).

## 7. Train and ship a local policy (proposed)

:::caution[Proposed: not implemented yet]
See [Local policy](/design/local-policy/).
:::

1. Keep playing in `cascade` mode; run automated scenarios to cover rare situations.
2. Train a policy from the Agent2Game Console. Check agreement with the model and the coverage report.
3. Run in `shadow` mode to compare the policy with the model live.
4. Commit `a2g_policy.json`, set the mode to `local` and disable the SDK's network part in the release build.
