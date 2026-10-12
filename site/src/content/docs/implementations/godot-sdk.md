---
title: Godot SDK
description: Reference A2G client for Godot 4 — what it does, its API and where to get it.
sidebar:
  order: 1
---

The Godot SDK is a single GDScript file, `A2GClient.gd`, registered as the autoload `A2G`. It implements the client side of the protocol and contains no game-specific code.

:::caution[Not published yet]
The SDK currently lives inside the [example game](/examples/lango/) as `A2G/A2GClient.gd` and is not yet released as a separate Godot addon. Publishing it is on the [roadmap](/roadmap/).
:::

## What it does

- Loads `res://a2g_manifest.json` and opens a [session](/specification/session/); reopens it after a `409` or service restart.
- Every 0.25 s collects tracked entities whose refresh interval has passed and sends up to 16 of them in one [decide](/specification/decide/) request, with at most 2 requests in flight.
- Requests earlier (after ≥ 500 ms) when an entity's signature changes, for example when HP or visibility changes.
- Drops replies from an old [epoch](/glossary/#epoch), re-checks that the action was offered, and expires decisions after `ttl_ms`.
- Sends a [report](/specification/report/) when a decision ends, with numeric deltas of the observation and world.
- Sends [telemetry](/specification/telemetry/) every second and checks `/health` every 5 s.
- Starts in native mode; AI mode is switched on explicitly (`set_ai_enabled(true)` or the `--a2g-ai` command-line flag).

## API

```gdscript
# Setup (usually in your adapter's _ready)
A2G.world_provider = func() -> Dictionary: return {...}   # shared world state
A2G.register_adapter("bee", adapter)                       # one adapter per entity type

# In each entity
A2G.track(self, "bee")              # in _ready
if A2G.execute(self, delta):        # in _physics_process; true = A2G controls this frame
	return

# Mode
A2G.set_ai_enabled(true)            # increments the epoch and clears decisions
```

## Adapter contract

| Method | Required | Purpose |
| --- | --- | --- |
| `observe(node) -> Dictionary` | yes | Observation fields declared for the type |
| `legal_actions(node) -> Array` | yes | Actions allowed now; empty means "do not ask" |
| `execute(node, action, delta) -> bool` | yes | Perform the action; `false` = blocked, the adapter did something safe instead |
| `state(node) -> String` | no | Actual executed state for telemetry |
| `interval_ms(node) -> int` | no | Refresh interval (default 3000 ms) |
| `signature(node) -> Variant` | no | Value whose change triggers an early request |
| `release(node)` | no | Called when native AI takes control back |

## Configuration

Constants at the top of `A2GClient.gd`: `BASE_URL` (default `http://127.0.0.1:8787`), `MANIFEST_PATH`, `MAX_BATCH`, `MAX_INFLIGHT`, `BATCH_INTERVAL`, `DEFAULT_INTERVAL_MS`, `MIN_INTERVAL_MS`.

## Implementation status

Scopes, profiles, groups, named events and the new field types are specified but not yet supported by this SDK. See the [status table](/implementations/service/#implementation-status).

## Planned: local policy

:::caution[Proposed — not implemented yet]
See [Local policy](/design/local-policy/).
:::

- `A2G.set_mode("native" | "local" | "service" | "cascade" | "shadow")`, replacing `set_ai_enabled`; a `--a2g-mode=` flag for headless runs.
- Loads `res://a2g_policy.json`, checks its `manifest_hash`, and evaluates it in GDScript per the [policy format](/specification/policy-format/) — passing the conformance vectors.
- Cascade threshold per entity type; `shadow` predictions sent in reports.
- `A2G.network_enabled = false` for release builds that run only `local`.
- Debug overlay: mode switch for all five modes, per-entity source (`native / LOCAL / AI / FALLBACK`), policy version, shadow agreement.

## Other engines

There is no SDK for Unity, Unreal or other engines yet. Any client that follows the [specification](/specification/overview/) works with the service. A Unity SDK with a C# policy evaluator is the planned second engine; it must pass the same conformance vectors, so one policy file behaves the same in Godot and Unity.
