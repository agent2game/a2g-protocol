---
title: Deployment, load and offline
description: Where the decision service runs, what happens when the network or provider fails, how it handles tens of thousands of players, and when to use A2G at all.
sidebar:
  order: 5
---

:::caution[Design proposal]
The 0.1 reference service is a single local process for development. Hosted deployment, authentication, dollar budgets and the service architecture below are **proposed**. The protocol-level scaling tools (groups, scopes, events, cache) are part of the [specification](/design/scaling/).
:::

## The non-negotiable rule: the game never breaks

A2G is an **enhancement layer**, never a dependency. Every entity always has working native AI. If the network, the service or the provider fails, the game keeps playing with its original behavior.

This is already true in 0.1:

| Failure | What the game sees | What happens |
| --- | --- | --- |
| No internet / service down | Request error or timeout (4 s) | Native AI; SDK keeps retrying in the background |
| Provider slow or down | `source: FALLBACK` | Native AI for that batch |
| Service overloaded | `FALLBACK` ("Service busy") | Native AI |
| Invalid or stale reply | Rejected by SDK | Native AI |
| Decision expired (TTL) | n/a | Native AI until the next decision |

No frame ever waits for the network: requests are asynchronous, and an entity without a fresh decision simply runs its native AI.

**Proposed improvements:**

- **Middle tier offline:** a [local policy](/design/local-policy/) shipped in the build, so offline play keeps "AI-like" behavior instead of dropping to the plain FSM.
- **Circuit breaker:** after repeated provider failures the service answers `FALLBACK` instantly for a cool-down period instead of letting every request time out.
- **Fast fail on the client:** the SDK stops asking for a while after consecutive errors, saving battery and bandwidth.

## Deployment topologies

| Topology | Who runs the SDK | Who runs the service | Where the key lives | Fits |
| --- | --- | --- | --- | --- |
| **Local dev** (0.1) | Game client | Developer machine, `127.0.0.1` | Service `.env` | Development, evaluation |
| **Server-authoritative multiplayer** | Game server | Studio backend, same region | Studio secret manager | MMO, matchmade games |
| **Single-player / client-side** | Game client | Studio backend or hosted A2G | Service only; the client gets a short-lived join token from the studio backend | Single-player, co-op |
| **Hosted A2G** | Either | A2G cloud | A2G, or the studio's own provider key | Studios without backend |
| **Shipped with a local policy** *(proposed)* | Game client or server | None at runtime; the service is used only during development | Developer machine only | Offline games, zero runtime cost |

Rules for all of them (normative details in [Security](/specification/security/)):

- The provider key **never** ships in a game build.
- In multiplayer, decisions are made on the **server** and replicated like any other server-side state. Clients never call the service for shared entities, otherwise players see different worlds and can cheat.
- A public service needs authentication per game and per session, registered manifests, rate limits and budgets, see [Security](/specification/security/). The 0.1 reference service implements only the `local` profile and must stay on `127.0.0.1`.

## Load: a worked example

**Scenario:** 50,000 concurrent players, each with ~20 AI-driven entities nearby.

A naive design: every entity decides every 5 s through a model:

```text
50,000 players × 20 entities ÷ 5 s = 200,000 decisions/s
```

That is too many for any provider quota and too expensive (see [Cost](/design/cost/)). The answer is not a bigger server; it is **fewer model decisions**:

| Lever | Effect | Decisions/s |
| --- | --- | --- |
| Naive | n/a | 200,000 |
| Decide only for engaged entities (in view or in combat), ~5 of 20 | ÷ 4 | 50,000 |
| [Events](/specification/manifest/#events) + 10 s `refresh_ms` instead of 5 s polling | ÷ 2 | 25,000 |
| Squad decisions: one per group of 5 | ÷ 5 | 5,000 |
| [Decision cache](/specification/manifest/#decision-cache), 60 % hit rate | × 0.4 | 2,000 |
| Distilled local policy handles 50 % of the rest | × 0.5 | **1,000** |

1,000 decisions/s batched 16 per request is ~60 provider requests/s, an ordinary load for a horizontally scaled service. Check it against provider quotas: at ~300 tokens per decision that is ~300k input tokens/s (18M/min).

- TypeSafe Jev's default limit is 100k tokens/s and 80 requests/s, enough for about a third of this load; the rest needs an enterprise limit or a second provider.
- OpenAI `gpt-6-luna` quotas depend on the usage tier: 2M tokens/min on the entry tier, 180M/min on the "Grow" tier.

Quotas are one more reason to route across [several providers](/design/providers/#combining-providers-proposed) and to fall back gracefully when one is saturated.

The same game still has 1,000,000 entities driven every frame, by native AI, as before.

## Service architecture at scale (proposed)

```text
game servers ──▶ load balancer ──▶ stateless decision workers ──▶ provider(s)
                                         │            │
                                 memory/cache store   deadline queue
                                   (e.g. Redis)     (drops requests whose
                                                     TTL already passed)
```

- **Stateless workers** scale horizontally; sessions, memory and the cache live in a shared store.
- **Deadline queue:** a decision that cannot be answered before its TTL is dropped before calling the provider, paying for a late decision is waste.
- **Cross-session batching:** entities from many sessions of the same game share one provider request (one shared static prefix).
- **Priorities:** boss fights and story NPCs before background wildlife.
- **Budgets:** per game, per session and per entity type; over budget means `FALLBACK`, never an error the player can see.
- **Regional deployment** near game servers and provider endpoints to keep latency inside the TTL.
- **Several providers** with failover (see [Decision providers](/design/providers/)).

## When to use A2G

**Good fit**

- Tactical and behavioral choices on a scale of seconds: engage, retreat, flank, guard, negotiate.
- Characters with personality described in text, where hand-writing every branch is costly.
- Long-tail situations a state machine handles badly.
- Adaptive difficulty and director-style pacing.

**Poor fit**

- Frame-level control: aiming, steering, physics, animation, pathfinding.
- Hard real-time reactions under ~100 ms.
- Lockstep or deterministic simulations where every client must compute the same result (unless decisions are made once on the server and replicated).
- Competitive balance that must be exactly reproducible.
- Games that cannot accept an external dependency at all, although native fallback keeps them playable.
