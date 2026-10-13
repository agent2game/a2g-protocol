---
title: JS/TS SDK
description: Reference A2G client for JavaScript and TypeScript games, in the browser and on Node, its API and a demo.
sidebar:
  order: 2
---

The JS/TS SDK is an A2G client for web and Node games: browser games (Phaser, PixiJS, Three.js, plain canvas) and server-side or turn-based games (Node, Next.js, Deno, Bun). It is one TypeScript module with no runtime dependencies and no game-specific code. It behaves like the [Godot SDK](/implementations/godot-sdk/), with the same calls in JavaScript style, plus `decideNow()` for games that decide once per turn.

**Source and releases:** [github.com/agent2game/a2g-sdk-js](https://github.com/agent2game/a2g-sdk-js). Current release: `v0.2.0` (protocol 0.1; browsers with `fetch`, Node 22.18+). Not on npm yet; install from GitHub:

```sh
npm install github:agent2game/a2g-sdk-js#v0.2.0
```

## Real-time games

```ts
import { A2G } from '@agent2game/a2g';
import manifest from './a2g_manifest.json';

const a2g = new A2G({
  manifest,
  url: 'http://127.0.0.1:8787',
  game: 'My game',
  world: () => ({ player_hp_fraction: player.hp }),        // shared world state
  scope: () => ({ scope: 'cave', state: { lit: false } }), // active scope, or null
  paused: () => game.paused,                               // telemetry only, no decisions
});

a2g.registerAdapter('guard', {
  observe: (g) => ({ hp_fraction: g.hp, sees_player: g.seesPlayer() }),
  legalActions: (g) => (g.seesPlayer() ? ['attack', 'retreat', 'patrol'] : ['patrol']),
  execute: (g, action, dt) => g.perform(action, dt),     // false = blocked, the adapter did something safe
});

a2g.start();                        // batches decisions every 250 ms, telemetry every second
a2g.track(guard, 'guard');

// in the game loop, for each entity
if (!a2g.execute(guard, dt)) guard.runNativeAi(dt);

a2g.setAiEnabled(true);             // native AI is the default
```

## Turn-based and server-side games

Keep the client on the game server when the true game state must not reach players. Ask once per turn, then apply:

```ts
await a2g.decideNow();              // every tracked entity, in batches of 16, each wave capped at 4 s
for (const npc of npcs) {
  if (!a2g.execute(npc, 0)) applyNativeChoice(npc);
}
await a2g.sendTelemetry();          // after every turn, instead of a timer
```

A decision that ran is reported as `executed` when the next turn replaces it, even if the player's turn outlasted its `ttl_ms`.

## Decision slots and sampling

For a type with [decision slots](/specification/manifest/#decision-slots), `legalActions` returns `{ slot: actions }` for the slots to ask (leave one out to keep it native) and `execute` receives `{ slot: action }` for the slots A2G decided. To keep the game's odds and seeded replays, pass a sampler built on the game's random function:

```ts
import { A2G, sampler } from '@agent2game/a2g';
const a2g = new A2G({ manifest, sample: sampler(game.rng) });   // game.rng(): [0, 1)
```

The SDK samples on a decision's first `execute()`, in the game's order, and reports the actions the game executed.

## Adapter contract

Same as the [Godot SDK](/implementations/godot-sdk/#adapter-contract) in camelCase (with the slot forms above): `observe`, `legalActions`, `execute` (required), `state`, `position` (`[x, y]`, `[x, y, z]` or `{x, y, z?}`), `trigger`, `intervalMs`, `release` (optional).

Other calls: `track(entity, type, { id, name, profile, parent })`, `untrack(entity)`, `setParent`, `updateContext(scopes, profiles)`, `scopeReady`, `decision(entity)`, `sendTelemetry()`, `stop()`.

## Browser games and the local service

A page on a dev server (for example `http://localhost:5173`) has a different origin from the [reference service](/implementations/service/). Either start the service with `A2G_ALLOWED_ORIGINS=http://localhost:5173` ([rules](/specification/security/#browser-games-during-development)), or proxy `/a2g` through the dev server and pass `url: '/a2g'`; the proxy must check its own `Host` and `Origin` before it drops `Origin`, and forward only `/v1/*` and `/health` (the demo's `serve.mjs` shows how). Never put a provider key in a browser bundle; shipped browser games need the `client` profile.

## Demo

The repository has a browser demo with a player and four guards (plain canvas, no build step): `npm run build && npm run demo`, then open `http://127.0.0.1:5180/`. Colors show who controls each guard: native AI, an A2G decision with its confidence, or a fallback.

## Tests

`npm test` type-checks the module and runs offline tests against a fake service; every message the client sends is validated against the [JSON Schema](/schema/0.1/a2g.schema.json).
