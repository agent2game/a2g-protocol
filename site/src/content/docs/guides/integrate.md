---
title: Integrate a game
description: The steps to connect an existing game to A2G, manifest, adapter and hooks.
---

This guide uses the [Godot SDK](/implementations/godot-sdk/); the [JS/TS SDK](/implementations/js-sdk/) has the same calls in JavaScript style. The steps are the same for any engine.

One principle runs through every step: the game's existing decision logic (an FSM, rules, utility AI, behavior trees, even its own model calls) is its **native AI**. A2G does not replace or rewrite it. It is the default, and it runs whenever A2G has no fresh, valid decision.

## 0. Find or write the client

Check Implementations for an SDK for your engine or language: [Godot](/implementations/godot-sdk/), [JavaScript and TypeScript](/implementations/js-sdk/) (browser and Node). If there is one, use it and continue with [the decision service](#decision-service).

### No SDK for your engine

Write a small client in your engine's language. It is the same for every game, so keep it separate from game code, one module that the adapter plugs into. It must follow these rules:

| Area | Rule |
| --- | --- |
| Separation | Engine-specific but **game-agnostic**: no references to your game's classes. Everything game-specific lives in the adapter and the manifest |
| Game loop | Never block a game-loop step (frame, tick or turn) on the network. Requests are asynchronous; at most a few in flight. A turn-based or server game may wait for a turn's decisions, with a hard time limit, and fall back for the rest |
| Session | Load the manifest from a file, open [`/v1/session`](/specification/session/), keep the `session_token`, reopen on `401`/`409` |
| Decide | Batch up to 16 entities that need a decision (timer, [event](/specification/manifest/#events) or changed values) into one [`/v1/decide`](/specification/decide/) |
| Validation | Drop replies with an old `epoch`; accept an action only if it is in the `legal_actions` you sent; expire it after `ttl_ms` |
| Fallback | On any error, timeout, non-`200`, `FALLBACK` or expired decision, run the game's **existing AI**. The client never invents an action |
| Report | When a decision ends, send [`/v1/report`](/specification/report/) with its `decision_id`, status and a few numeric outcomes |
| Telemetry | In every mode, send [`/v1/telemetry`](/specification/telemetry/) with each entity's actual state: about once per second in real-time games, after every turn in turn-based games |
| Modes | Start in native mode; AI control is switched on explicitly and switching modes increments the epoch |
| Security | No provider keys in the build; the session token on every request; no personal data in observations ([Security](/specification/security/)) |
| Correctness | Validate your messages against the [JSON Schema](https://agent2game.org/schema/0.1/a2g.schema.json) in tests, and test with the service stopped: the game must play normally |

The public surface mirrors the [Godot SDK](/implementations/godot-sdk/#api): `register_adapter`, `track`, `execute(entity, delta) -> bool`, `set_ai_enabled`, `update_context`, with events reported by the adapter's `trigger`. Keeping the same names makes the manifest, adapter and documentation portable between engines.

### Decision service

The client talks to an A2G **decision service**, which holds the provider key, validates requests and calls the model. Use an existing one: the [reference service](/implementations/service/) for development, or a hosted one. If none is running, start the reference service with Docker and a provider key:

```sh
docker run -d --name a2g -p 127.0.0.1:8787:8787 -v a2g-data:/data -e TYPESAFE_API_KEY=... -e A2G_PROVIDER=jev ghcr.io/agent2game/a2g-service:0.1.0
```

It answers on `http://127.0.0.1:8787` (`/health` for status, `/` for the Agent2Game Console). Do not write a service or a console for one game; their logic is the same for every game. Without Docker or a provider key, test the client against a stub that follows the [specification](/specification/overview/).

Where things run:

| Game | Client | Service |
| --- | --- | --- |
| Desktop, mobile or console game | In the game | On the developer's machine for development; a hosted service with join tokens (`client` [profile](/specification/security/#deployment-profiles)) when shipped |
| Browser game, logic in the page | In the page | Same as above. During development, list the dev server's origin ([browser games](/specification/security/#browser-games-during-development)) or proxy through the dev server |
| Server-authoritative game (multiplayer, turn-based, web game with a backend) | On the game server, so true state never reaches players | Next to the game server (`server` profile) |

A provider key never ships to players: not in a build, not in a browser bundle.

A game server runs **one client per match** (game, room or save), each with its own `client_id`, session and epoch. A service keeps no cap on the number of sessions.

## 1. Choose entities and actions

Pick the kind of entity whose behavior you want the model to drive: enemies, NPCs, units. List the actions your game **already knows how to execute** for them, such as `chase`, `flee`, `idle`, `wander`. A2G does not add new abilities; it chooses between existing ones.

Keep the game's rules of play. If the native AI makes **several independent choices** per turn (how hard to work, whether to help, whether to ask for a raise), declare them as [decision slots](/specification/manifest/#decision-slots) rather than one list, so they can still happen together. If it **rolls dice** (a behaviour happens with some probability), [sample](/specification/decide/#sampling) from the returned probabilities with the game's own random generator instead of always taking the most likely action. Then AI mode changes *who* weighs the situation, not what can happen in the game.

## 2. Write the manifest

Create `a2g_manifest.json` describing the world, each entity type, what it observes and its actions. See [Manifest](/specification/manifest/) for the format.

Tips:

- Use normalized values (`hp_fraction` instead of raw HP) and state units in the world text.
- Put personality in the type `description`, mechanics in action descriptions.
- Expose only what the entity could plausibly know.
- Leave out `max_input_tokens` at first. Add a budget once you know the real size from the Agent2Game Console; a budget below the size of a type's question makes every decision of that type fall back with `code: "budget"`.
- If the game replays runs from a seed, [sample](/specification/decide/#sampling) A2G's probabilities with the game's seeded generator, once per decision and in the game's own order, so a run replays identically.

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

If the game already has an authenticated admin or operations area, add an "A2G" entry there that serves the Agent2Game Console through a server-side proxy (for example at `/admin/a2g/`) behind the admin's own login, rather than rebuilding the console. The proxy checks the admin session and the request's own `Origin`, then forwards to the service with the service's own `Host` and without the browser's `Origin`.

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
