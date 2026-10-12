---
title: Integrate a game
description: The steps to connect an existing game to A2G — manifest, adapter and hooks.
---

This guide uses the [Godot SDK](/implementations/godot-sdk/). The steps are the same for any engine.

## 1. Choose entities and actions

Pick the kind of entity whose behavior you want the model to drive — enemies, NPCs, units. List the actions your game **already knows how to execute** for them, such as `chase`, `flee`, `idle`, `wander`. A2G does not add new abilities; it chooses between existing ones.

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
3. Open the service console at `http://127.0.0.1:8787/` and check that decisions are `AI`, actions match executed states and reports arrive.

Switch AI mode off to return to the original behavior at any time.

## 6. Scale up

When the game grows beyond a few enemies, add what it needs, one tool at a time: [events](/specification/manifest/#events) and a long `refresh_ms`, [scopes](/specification/manifest/#scopes) for levels, [profiles](/specification/manifest/#profiles) for named characters, [groups](/specification/decide/#groups) for squads and the [decision cache](/specification/manifest/#decision-cache) for crowds. See [Scaling to complex games](/design/scaling/).

## 7. Train and ship a local policy (proposed)

:::caution[Proposed — not implemented yet]
See [Local policy](/design/local-policy/).
:::

1. Keep playing in `cascade` mode; run automated scenarios to cover rare situations.
2. Train a policy from the service console. Check agreement with the model and the coverage report.
3. Run in `shadow` mode to compare the policy with the model live.
4. Commit `a2g_policy.json`, set the mode to `local` and disable the SDK's network part in the release build.
