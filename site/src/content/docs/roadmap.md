---
title: Roadmap
description: What comes next for A2G, and open design questions for complex games.
---

**Done in 0.1:** game-agnostic manifest, batched decisions, per-entity memory via reports, protocol version in session, situation context (population, nearby), scopes, profiles and `/v1/context`, groups, events and `refresh_ms`, vector, reference and list fields, token budgets, decision cache, fallback codes, manifest hash, `decision_id` and the `local` security profile, in the Godot SDK and the reference service.

**Specified in 0.1, not yet implemented:** the `server` and `client` security profiles (API keys, join tokens, session tokens), registered manifests, rate limits and client-session cache isolation. See [implementation status](/implementations/service/#implementation-status).

## Next

1. **Hosted security profiles.** `server` and `client` profiles with session tokens, join tokens, registered manifests and rate limits in the reference service and Godot SDK.
1. **Shared storage for hosted scale.** Move sessions, issued decision ids, memory, telemetry snapshots and the decision cache to Redis, and session history, costs, manifest overrides and API keys to PostgreSQL, so the reference service can run several workers. Local runs keep the dependency-free SQLite setup. See [Service architecture at scale](/design/deployment/#service-architecture-at-scale-proposed).
1. **Local policy.** Persistent decision log, training, policy format with conformance vectors, `local` / `cascade` / `shadow` modes in the Godot SDK, release builds without the service. See [Local policy](/design/local-policy/).
1. **Publish the reference service** as a public repository, and list the [Godot SDK](https://github.com/agent2game/a2g-sdk-godot) in the Godot Asset Store. The SDK and the [Lango example](https://github.com/agent2game/a2g-example-lango-godot) are already public.
2. **Measure against native AI.** Replayable scenarios comparing chosen vs. executed actions, outcomes, latency, fallback rate and cost. Reports and telemetry already collect the data.
3. **Second game.** Integrate another existing game and count the manual edits to the adapter and manifest.
4. **More engines.** SDKs for Unity and Unreal, each with a policy evaluator passing the conformance vectors.
5. **Integration tooling.** After portability is shown: discovery and manifest/adapter generation.

## Open questions for complex games

Scopes, profiles, groups, events, richer field types, token budgets and the decision cache are now part of the [specification](/design/scaling/) and answer the earlier questions about levels, richer observations, relations, metadata and events. These remain open before 1.0:

| Area | Question |
| --- | --- |
| **Action parameters** | `move_to(x, y)`, `attack(target_id)`, `use(item)`, typed parameters per action, reserved but not specified. |
| **Long-term memory** | Memory beyond the last 8 reports, persisted across sessions, shared between entities. |
| **Scale and timing** | Priorities between entities, per-type rate limits, cost budgets in dollars. |
| **Build metadata** | Game version and build in the session, beyond the manifest hash. |
| **Dialogue and free text** | Whether and how to allow generated text while keeping choices typed. |
| **Security** | Authentication and multi-tenant hosting for a non-local service. |

Have a use case that does not fit? It is exactly the input this list needs.
