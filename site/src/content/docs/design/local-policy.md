---
title: Local policy
description: Train a small in-game model on the big model's decisions during development, then ship the game with it — no service, no network, no per-decision cost.
sidebar:
  order: 2
---

:::caution[Proposed — not implemented yet]
This page describes a planned part of A2G. Protocol version stays **0.1**; the additions are marked as proposed in the specification.
:::

## The idea

During development the game asks a large model for decisions through the decision service. Every decision — context, chosen action, probabilities, outcome — is logged. From these logs A2G trains a small **local policy** per entity type and puts it into the game. The shipped game uses the local policy offline, with native AI as the safety net.

The large model acts as a **teacher**; the local policy is the **student**. The protocol already defines everything both need: the [manifest](/specification/manifest/) gives the inputs (observation and world fields) and the outputs (actions), [decide](/specification/decide/) and [report](/specification/report/) produce training examples, and the local policy answers the same question the service answers — so game code and the adapter do not change.

```text
 development                                         release
 ───────────                                         ───────
 play / autotests ─▶ service + large model           game
        │                  │                           │
        │            decision log ─▶ train ─▶ a2g_policy.json ─▶ local policy
        │                                                          │
        └──────────── shadow: compare local vs. model ──┘          native AI (fallback)
```

**Why it matters:** the expensive model becomes a development tool. A shipped game has no dependency on a cloud, no keys, no latency and no per-decision cost. Teams that want live model decisions can still ship a hybrid.

## Five control modes

| Mode | Who decides | Network | Used for |
| --- | --- | --- | --- |
| `native` | The game's native AI | no | Always available; the safety net |
| `local` | Local policy; native AI if it has no answer | no | Shipped game |
| `service` | Decision service (large model) | yes | Development, online hybrid |
| `cascade` | Local policy when confident, otherwise the service | yes | Main mode for collecting data |
| `shadow` | The service decides; the local policy predicts alongside for comparison | yes | Checking readiness to ship |

Failures always step down: `service` → `local` → `native`. No frame waits for the network. See [Modes and fallback](/specification/fallback/).

## Development loop

1. **Collect.** Play the game in `service` or `cascade` mode. The service writes every decision and its outcome to a persistent log, tagged with the [manifest hash](/glossary/#manifest-hash).
2. **Widen coverage.** One developer plays in one style. Headless scenarios and bots running in `cascade` fill in situations a human rarely reaches. The training report shows where data is thin.
3. **Train.** One action — a console button or a command — produces a new policy version with metrics: agreement with the teacher per entity type and per situation, model size, and readable rules for tree models.
4. **Verify.** Run in `shadow`: the model still decides, and the console shows how often the local policy would have chosen the same action. In `cascade`, watch the share of decisions that still need the service fall.
5. **Ship.** Commit `a2g_policy.json` with the game, set the mode to `local`, and disable the SDK's network part for the release build.
6. **Repeat** when the game changes. A changed manifest produces a new hash and the old policy stops loading; a balance change needs a new data epoch.

## What the policy learns

- **Inputs:** the entity's observation and the world state, as declared in the manifest. Numbers stay numbers, booleans become 0/1, enums become one-hot vectors.
- **Target:** the teacher's full probability distribution over the legal actions, not only its top choice. Learning "how close the alternatives were" makes a better student.
- **Not inputs:** descriptions, lore and personality text. They are constant per type, and the teacher's decisions already reflect them. A separate policy per type (or per type and profile) carries that personality.

Two levels of training:

- **Imitation** — copy the teacher. Simple and immediate, but the student cannot exceed the teacher and inherits its mistakes.
- **Outcome-weighted** — weight examples by how the decision ended (HP kept, damage dealt, objective held). This needs the game developer to define what "good" means, and it is how a local policy can become better than its teacher.

## One policy, every engine

SDKs are written per engine anyway: Godot, Unity, Unreal. To keep the policy itself portable, A2G defines its own small [policy format](/specification/policy-format/) rather than depending on a machine-learning runtime:

| Option | Unity | Unreal | Godot | Web, mobile, consoles | Role |
| --- | --- | --- | --- | --- | --- |
| **A2G policy format** (JSON) | ~100 lines of C# | ~100 lines of C++ | ~100 lines of GDScript | works everywhere | **Default** |
| ONNX | built-in runtime | built-in runtime | needs a native plugin | native libraries per platform | Optional export for larger models |
| Shared native core (C/Rust) | plugin | module | GDExtension | build per platform | Later, if many SDKs exist |

The format supports decision trees, tree ensembles and small neural networks (MLP). Open Jev-compatible projects show the other end of the same idea — fine-tuned [Kev](https://github.com/jaredpalmer/kev) models, task-trained [NanoJev](https://github.com/TianyuCodings/NanoJev) and tiny [jevlike](https://github.com/vinnylarouge/jevlike) scorers — and can serve as teachers or training back-ends; see [Decision providers](/design/providers/#jev-compatible-open-models). All of them evaluate with plain arithmetic in microseconds. **Conformance vectors** — inputs with expected outputs — ship with the specification, and every SDK must reproduce them, so one policy file behaves the same in every engine.

## Versioning

- Every training example and every policy carries the **manifest hash**. A policy only loads if its hash matches the game's manifest.
- A policy has its own version, records its teacher (provider and model) and how many examples it was trained on.
- Balance changes do not change the manifest, so the developer starts a new **data epoch** to keep stale examples out of training.

## Limits

- **Coverage:** a policy does not know situations it never saw. Use `cascade`, bots and the coverage report.
- **Quality ceiling:** pure imitation copies the teacher's mistakes; outcome weighting addresses this.
- **No language understanding at runtime:** new lore or descriptions need retraining; a hybrid with the service covers this.
- **Player data:** collecting from players, rather than playtests, requires consent and privacy handling.

## Cost

Development-time cost is small: a playtest session with a few enemies costs about $0.10–0.25 per hour on current [prices](/design/cost/#prices). Tens of hours of playtesting cost a few dollars, and the shipped game costs nothing per decision.
