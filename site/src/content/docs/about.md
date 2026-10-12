---
title: About
description: Who is behind Agent2Game and why it exists.
---

## Why I started A2G

I believe that one day games will come alive through AI.

Not as a gimmick, and not by replacing the people who design them — but as characters that notice what you do, remember it, and answer with intent instead of a script. Today almost every enemy, companion and townsperson is a hand-written state machine. Designers spend weeks wiring branches that players see through in minutes, and thousands of existing games will never get that attention again.

Models can already make good, fast, typed decisions. What is missing is a **safe, boring, repeatable way** to connect them to real games: one that keeps the game in charge, never breaks when the network does, makes cost predictable, and lets you see exactly what happened and why. That is what A2G is for.

I want A2G to be:

- **Open** — a protocol anyone can implement, for any engine and any model.
- **Respectful of games** — the game stays authoritative; its original behavior is always the fallback.
- **Practical** — measured in integration hours, latency and dollars, not demos.
- **A path to shipping** — use large models while you build, then ship a small local policy trained on their decisions.

A2G is at an early stage: one game integrated end to end, and a lot still to prove. If you build games, engines or decision models and this resonates, I would love to hear from you.

## License and attribution

A2G is open and free to use, including in commercial and closed-source games. The specification, documentation and reference code are released under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0). Copyright 2026 agent2game.

You may:

- implement the protocol in any engine, language or model provider;
- use, modify and ship the reference service and SDKs in your own products;
- build commercial tools and services on top of A2G.

When you redistribute A2G code or documentation, or a modified version of it:

- keep the `LICENSE` and `NOTICE` files;
- show the `NOTICE` text wherever your product lists third-party credits (game credits, an About screen or a licenses page);
- mark the files you changed.

If you write your own implementation from the specification alone, no attribution is required, but we would love a mention such as "Built with the Agent2Game (A2G) protocol — agent2game.org".

The Apache License does not grant rights to the Agent2Game and A2G names or logo. You may say that your product is "compatible with A2G" or "implements A2G" if it follows the specification; please do not present a fork or an incompatible variant as the official A2G.

## Authors

**Ivo Dimitrov** — creator of Agent2Game · [LinkedIn](https://www.linkedin.com/in/millt/)
