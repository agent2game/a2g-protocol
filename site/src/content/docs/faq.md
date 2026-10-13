---
title: FAQ
description: Common questions about A2G, grouped by topic, from offline games and cost to control, privacy and AI skepticism.
---

Short answers with links to the pages that hold the details. Parts marked *proposed* are designed but not implemented yet; see the [roadmap](/roadmap/).

## The idea

### What does A2G actually do?

It lets an existing game ask a model which move a character should make next. The game describes itself once in a [manifest](/glossary/#manifest), sends what each [entity](/glossary/#entity) observes and which [actions are legal](/glossary/#legal-actions) right now, gets back one typed choice per entity, validates it and executes it through its own code. Anything else (no reply, a late reply, an invalid one) runs the game's original [native AI](/glossary/#native-ai). See the [introduction](/docs/introduction/).

### Is this generative AI? Does it replace designers, writers or artists?

No. A2G generates no art, voices, music or dialogue. It picks one move from a list that people built, the next step after state machines, behavior trees and goal planners. Designers still decide what a character can do, writers still write its profile, programmers still decide what each action does. The model only chooses between them.

### Why not just write better behavior trees?

You can, and for many entities you should. A2G is for the moments where hand-written branches show their seams: a boss that should read the whole fight, a squad that should react to what the player keeps doing, a director that paces an encounter. It also helps games that will never get another month of AI work. The two are not exclusive: your behavior tree stays as the fallback and as the frame-level executor of every decision.

### Has it been shown to beat native AI?

Not yet. Protocol 0.1 is validated end to end on [one game](/examples/lango/). Measuring chosen and executed actions, outcomes, latency, fallback rate and cost against native AI is next on the [roadmap](/roadmap/). The telemetry to do it is already in place.

## Offline and networking

### My game has no internet connection. Why would I need this?

Use the model during development, not at runtime. *(Proposed.)* While you build and playtest, the model decides and every decision with its outcome is logged. A2G trains a small [local policy](/glossary/#local-policy) from that log and you ship it inside the game: it runs offline, in under a millisecond, with no service, no keys and no per-decision cost. Native AI stays underneath as the safety net. See [Local policy](/design/local-policy/).

### What happens today if the network drops mid-game?

The game keeps playing with its original behavior. A timeout, a busy or failed provider, an invalid or expired decision all fall back to native AI for the affected entities, and the SDK retries in the background. A2G is an enhancement layer, never a dependency. See [Deployment, load and offline](/design/deployment/#the-non-negotiable-rule-the-game-never-breaks).

### Will latency make the game lag?

No frame ever waits for the network. Requests are asynchronous and batched; an entity without a fresh decision runs native AI until one arrives. Decisions are about intent ("flank", "retreat", "guard the gate") and live for seconds ([TTL](/glossary/#ttl)), while aiming, steering, pathfinding and animation stay in native code every frame. TypeSafe Jev answers a batch of 16 entities in about 0.3 s. See [Modes and fallback](/specification/fallback/).

### Can it run fully on my own hardware?

Yes. Open Jev-compatible models such as Kev, Laya or decider run on a developer machine or your own servers, and a shipped local policy *(proposed)* runs inside the game itself. See [Decision providers](/design/providers/).

## Cost and scale

### How much does it cost?

Typed-decision providers charge for input tokens only, around 400 tokens per decision. One fight with six enemies deciding every five seconds costs about $0.10 to $0.24 per hour of play; 40 hours of playtesting costs a few dollars in total. See [Cost](/design/cost/) for the formula and worked examples.

### Who pays: me or my players?

You, or whoever runs the decision service. Players never hold a provider key, and the key never ships in a build. With a local policy *(proposed)* the runtime cost is zero.

### Does it scale to large worlds and many players?

Cost and load scale with the number of decisions, not with the size of the world. Decide only for engaged entities, decide per squad instead of per member ([groups](/glossary/#group)), ask on [events](/glossary/#event) instead of polling, reuse answers through the [decision cache](/glossary/#decision-cache), and send static lore once through [scopes](/glossary/#scope) and [profiles](/glossary/#profile). The worked example for 50,000 concurrent players goes from 200,000 to 1,000 decisions per second. See [Scaling](/design/scaling/) and [Deployment](/design/deployment/#load-a-worked-example).

## Control and quality

### What if the model makes a bad or illegal choice?

It cannot make an illegal one: it only picks from the actions the game offered at that moment, and the game validates the choice again before executing it. A choice outside the list, a refusal or a stale answer is dropped and native AI runs. Bad but legal choices are visible: every decision has a [decision id](/glossary/#decision-id), its confidence and its outcome in [telemetry](/glossary/#telemetry) and the Agent2Game Console.

### We balanced our AI by hand. Will a model ruin it?

You choose what it controls. Drive only the entities and moments that benefit from judgment and keep the rest native. Designers shape the model's play through action descriptions and character [profiles](/glossary/#profile), and narrow its options per situation through `legal_actions`. AI control is opt-in; switching back to native is a single mode change.

### Our AI already calls a model. What does A2G add?

Not smarter decisions on day one: if your native AI already asks a model with carefully tuned questions, A2G asking the same model gives similar answers. What it adds is everything around the call. One manifest and one protocol instead of prompts spread through game code; the [Agent2Game Console](/implementations/service/) with every decision, its context, probabilities, outcome and cost; switching providers (including open models on your own hardware) by configuration; the [decision cache](/specification/manifest/#decision-cache) and [token budgets](/specification/manifest/#token-budget) to cut spend; and the logged decisions as training data for a [local policy](/design/local-policy/) *(proposed)* that can later replace most calls. Keep your existing calls as the native AI and fallback; your balance tuning (rates, caps, dice) still applies to A2G's [probabilities](/specification/decide/#sampling).

### Will enemies become unbeatable or unfair?

Only if you let them. The model chooses among your actions; damage, speed, cooldowns and reaction times stay in your code. Its instructions can describe the intended difficulty, for example a profile that tells a grunt to play like a grunt.

### Is it deterministic? How do we test and reproduce bugs?

Model decisions are not bit-for-bit deterministic, so A2G makes them observable instead: each decision is logged with its context, probabilities, the action actually executed and how it ended. Native mode stays fully deterministic for tests that need it. A shipped local policy *(proposed)* is a fixed file that returns the same answer for the same input.

## Integration

### How much work is it? Do I rewrite my AI?

No rewrite. Keep your state machine or behavior tree; it becomes the fallback and executes the chosen actions. You add a manifest and a thin adapter: what an entity observes, which actions are legal now, how to run each one. In the [Lango example](/examples/lango/) that is one adapter file and two calls in each enemy script. See [Integrate a game](/guides/integrate/).

### Which engines are supported?

The protocol is JSON over HTTP, engine- and language-neutral, for 2D and 3D games and any kind of entity. There are SDKs for [Godot](/implementations/godot-sdk/) and [JS/TS](/implementations/js-sdk/) (browser and Node, including game servers). Unity and Unreal SDKs are on the [roadmap](/roadmap/); until then any engine can call the service directly.

### Does it work in multiplayer?

Yes, with decisions made on the game server and replicated like any other server state. Clients must not ask the service about shared entities, or players would see different worlds and could cheat. See [Deployment topologies](/design/deployment/#deployment-topologies).

### Am I locked into one AI vendor?

No. The protocol names no model. The reference service supports OpenAI Decisions and TypeSafe Jev; open Jev-compatible models and general LLMs are described as integration designs. Switching providers is service configuration, not game code. See [Decision providers](/design/providers/).

## Security and privacy

### What data leaves the game?

Only what your manifest declares and your adapter sends: game state such as positions, health, nearby objects and recent outcomes. Accounts, chat and personal data are not needed. With an open model on your own hardware, nothing leaves your infrastructure.

### Can players steal the API key or abuse the service?

The provider key lives only in the decision service. A client-side game gets a short-lived join token from your backend, and the service checks every reply against the actions it offered. The hosted security profiles are specified and not implemented yet; the 0.1 reference service is local only. See [Security](/specification/security/).

## License

### Can I use A2G in a commercial or closed-source game?

Yes. The specification, documentation and reference code are under the Apache License 2.0. Keep the `LICENSE` and `NOTICE` files when you redistribute A2G code. See [About](/about/#license-and-attribution).
