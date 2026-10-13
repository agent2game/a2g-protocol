---
title: Godot SDK
description: Reference A2G client for Godot 4, what it does, its API and where to get it.
sidebar:
  order: 1
---

The Godot SDK is a Godot 4 addon, `addons/a2g/`, that registers the autoload `A2G`. It implements the client side of the protocol and contains no game-specific code.

**Source and releases:** [github.com/agent2game/a2g-sdk-godot](https://github.com/agent2game/a2g-sdk-godot). Current release: `v0.2.0` (protocol 0.1, Godot 4.7). The repository also has a minimal [demo](https://github.com/agent2game/a2g-sdk-godot/tree/main/demo) and offline tests.

## Install

1. Download `addons/a2g/` from a [release](https://github.com/agent2game/a2g-sdk-godot/releases) (the release archive contains only the addon) and copy it into your project.
2. Enable **Project → Project Settings → Plugins → A2G**. This adds the `A2G` autoload and the `a2g/*` settings below.
3. Put your [manifest](/specification/manifest/) at `res://a2g_manifest.json`, write an adapter and hook your entities ([guide](/guides/integrate/)).

## What it does

- Loads `res://a2g_manifest.json` and opens a [session](/specification/session/); keeps the returned `manifest_hash`; reopens after `401`/`409` or a service restart and replays earlier [context](/specification/context/) updates.
- Every 0.25 s collects tracked entities whose refresh interval has passed or that raised an [event](/specification/manifest/#events) and sends up to 16 of them in one [decide](/specification/decide/) request, with at most 2 requests in flight. Adds the active scope and its state, each entity's position, profile, parent and trigger.
- Re-asks every entity (after ≥ 500 ms) when the number of tracked entities changes.
- Drops replies from an old [epoch](/glossary/#epoch), re-checks that the action was offered and has a `decision_id`, and expires decisions after `ttl_ms`.
- Sends a [report](/specification/report/) with the `decision_id` when a decision ends, with numeric deltas of the observation and world.
- Sends [telemetry](/specification/telemetry/) every second (also while paused, without asking for decisions) and checks `/health` every 5 s.
- Stops asking after `403`; waits for `Retry-After` after `429`.
- Starts in native mode; AI mode is switched on explicitly (`set_ai_enabled(true)` or the `--a2g-ai` command-line flag).

## API

```gdscript
# Setup (usually in your adapter's _ready)
A2G.world_provider = func() -> Dictionary: return {...}            # shared world state
A2G.scope_provider = func() -> Dictionary: return {"scope": "cave", "state": {...}}  # active scope, or {}
A2G.register_adapter("bee", adapter)                                # one adapter per entity type
A2G.update_context({"boss_arena": {...}}, {"old_bat": null})        # add/replace/remove scopes and profiles
A2G.scope_ready("boss_arena")                                       # true once the service accepted it

# In each entity
A2G.track(self, "bee", {"profile": "queen_bee", "parent": leader})  # in _ready; options are optional
A2G.set_parent(self, squad)                                         # join or leave (null) a group later
if A2G.execute(self, delta):        # in _physics_process; true = A2G controls this frame
	return

# Mode
A2G.set_ai_enabled(true)            # increments the epoch and clears decisions

# Sampling (optional): draw actions from the provider's probabilities with the game's seeded RNG
A2G.sample = A2G.sampler(game_rng)
```

## Adapter contract

| Method | Required | Purpose |
| --- | --- | --- |
| `observe(node) -> Dictionary` | yes | Observation fields declared for the type |
| `legal_actions(node) -> Array` | yes | Actions allowed now; empty means "do not ask" (observe-only types). For [decision slots](/specification/manifest/#decision-slots): `{slot: Array}` for the slots to ask |
| `execute(node, action, delta) -> bool` | yes | Perform the action; `false` = blocked, the adapter did something safe instead. For decision slots `action` is `{slot: action}` for the decided slots; run native AI for the rest |
| `state(node) -> String` | no | Actual executed state for telemetry |
| `position(node) -> Vector2/Vector3` | no | Enables `nearby` and group member ordering |
| `trigger(node) -> String` | no | Name of a manifest event that just happened, or `""`; asks for a decision now |
| `interval_ms(node) -> int` | no | Refresh interval (default: the type's `refresh_ms`, then 3000 ms) |
| `release(node)` | no | Called when native AI takes control back |

## Configuration

Project Settings under `a2g/`, read at startup. Defaults apply when a setting is absent.

| Setting | Default | Meaning |
| --- | --- | --- |
| `a2g/service/url` | `http://127.0.0.1:8787` | Decision service base URL |
| `a2g/manifest_path` | `res://a2g_manifest.json` | The manifest |
| `a2g/decisions/max_batch` | `16` | Entities per decide request, capped at the protocol maximum of 16 |
| `a2g/decisions/max_inflight` | `2` | Decide requests in flight at once |
| `a2g/decisions/batch_interval` | `0.25` | Seconds between batch checks |
| `a2g/decisions/default_interval_ms` | `3000` | Refresh interval when neither the adapter nor the manifest sets one |
| `a2g/decisions/min_interval_ms` | `500` | Minimum time between two requests for one entity |

## Implementation status

Session tokens and the `server`/`client` security profiles are not supported yet. See the [status table](/implementations/service/#implementation-status).

## Planned: local policy

:::caution[Proposed: not implemented yet]
See [Local policy](/design/local-policy/).
:::

- `A2G.set_mode("native" | "local" | "service" | "cascade" | "shadow")`, replacing `set_ai_enabled`; a `--a2g-mode=` flag for headless runs.
- Loads `res://a2g_policy.json`, checks its `manifest_hash`, and evaluates it in GDScript per the [policy format](/specification/policy-format/), passing the conformance vectors.
- Cascade threshold per entity type; `shadow` predictions sent in reports.
- `A2G.network_enabled = false` for release builds that run only `local`.
- Debug overlay: mode switch for all five modes, per-entity source (`native / LOCAL / AI / FALLBACK`), policy version, shadow agreement.

## Other engines

Web and Node games use the [JS/TS SDK](/implementations/js-sdk/). There is no SDK for Unity, Unreal or other engines yet. Any client that follows the [specification](/specification/overview/) works with the service. A Unity SDK with a C# policy evaluator is the planned next engine SDK; it must pass the same conformance vectors, so one policy file behaves the same in Godot and Unity.
