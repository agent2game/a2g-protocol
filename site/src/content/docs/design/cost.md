---
title: Cost
description: How much A2G decisions cost, how to calculate it, and which levers change it.
sidebar:
  order: 3
---

Native AI is free at runtime. Every model decision costs money, so cost is a design parameter, like a frame budget.

## How cost is calculated

Typed-decision providers charge for **input tokens only**: the context sent to the model. The answer (one choice) is free.

```text
cost per hour = decisions per hour × tokens per decision × price per token
decisions per hour = active entities × 3600 ÷ seconds between decisions
```

**Tokens per decision** is the part the protocol controls. Measured on the reference service with the Lango manifest:

| Batch | Memory per entity | Tokens per request | Tokens per entity |
| --- | --- | --- | --- |
| 1 entity | none | ~370 | ~370 |
| 16 entities | none | ~3,800 | **~240** |
| 16 entities | 8 reports | ~8,500 | **~530** |

Batching shares the world description between entities. Memory roughly doubles the per-entity size.

## Prices

| Provider | Model | Input, per 1M tokens | Output | Source |
| --- | --- | --- | --- | --- |
| OpenAI Decisions | `gpt-6-luna` | $0.10 | free | [Decisions guide](https://developers.openai.com/api/docs/guides/decisions) |
| TypeSafe | `jev-1.13` | $0.042 | free | [TypeSafe models](https://docs.typesafe.ai/models.md) |
| General LLM with structured output | varies | varies | **charged** | Provider pricing |

Prices as of October 2026; check the sources before budgeting. OpenAI notes that regional and long-context multipliers may apply.

With ~400 tokens per decision:

| Provider | Cost per decision | Decisions per $1 |
| --- | --- | --- |
| OpenAI Decisions | ~$0.00004 | ~25,000 |
| TypeSafe Jev | ~$0.000017 | ~60,000 |

## Worked examples

**Single player, one fight.** 6 enemies, a decision every 5 s, with memory (~550 tokens):

```text
6 × 3600 ÷ 5 = 4,320 decisions/h × 550 = 2.4M tokens/h
OpenAI Decisions ≈ $0.24 per hour of play · Jev ≈ $0.10
```

**50,000 concurrent players, naive.** 20 entities each, every 5 s, ~550 tokens:

```text
200,000 decisions/s = 720M decisions/h × 550 = 396B tokens/h
OpenAI Decisions ≈ $39,600 per hour · Jev ≈ $16,600 per hour (≈ $0.33–0.79 per player-hour)
```

**50,000 concurrent players, designed.** Applying the levers from [Deployment and load](/design/deployment/#load-a-worked-example) brings it to ~1,000 decisions/s at ~300 tokens:

```text
3.6M decisions/h × 300 = 1.08B tokens/h
OpenAI Decisions ≈ $108 per hour · Jev ≈ $45 per hour (≈ $0.001–0.002 per player-hour)
```

**Development only, shipped with a local policy.** 40 hours of playtesting with a few enemies at ~$0.24 per hour:

```text
≈ $10 in total with OpenAI Decisions, ≈ $4 with Jev, and $0 per decision after release
```

The difference between the naive and designed cases is ~350×. It comes from **fewer decisions and smaller contexts**, not from a cheaper model.

## Levers, in order of impact

1. **Decide less often.** [Events](/specification/manifest/#events) with a long `refresh_ms`, and longer TTLs. Halving the frequency halves the cost.
2. **Decide for fewer entities.** Only engaged, visible or important ones; let background entities run native AI.
3. **Decide at a higher level.** One squad or director decision instead of many individual ones ([groups](/specification/decide/#groups)).
4. **Reuse decisions.** The [decision cache](/specification/manifest/#decision-cache), keyed by bucketed observations and shared across sessions.
5. **Shrink the context.** Batch entities, send static text once ([scopes](/specification/manifest/#scopes) and [profiles](/specification/manifest/#profiles)), trim memory to what matters, send relevant objects only, and cap it with [`max_input_tokens`](/specification/manifest/#token-budget).
6. **Choose the provider.** Typed-decision models are cheaper and faster than general LLMs for this job.
7. **Distill.** A [local policy](/design/local-policy/) trained on logged decisions costs nothing per decision. Used fully, it moves model cost from runtime to development.

## Budgets (proposed)

Cost must have a ceiling the game controls. Proposed for 0.2:

- The manifest or session declares budgets: per session per hour, per entity type, per game per day.
- The service tracks spend from provider `usage` and answers `FALLBACK` with reason `budget` when a budget is exhausted, the player sees native AI, never an error.
- Higher-priority entities (bosses, story characters) draw from the budget first.

## What the reference service measures today

The 0.1 service reads `usage` from each provider reply, converts it to dollars with a built-in price table and shows the cost per batch and per client in the console. Regional and long-context premiums are not applied, so treat the numbers as estimates.
