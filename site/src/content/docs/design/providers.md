---
title: Decision providers
description: Which models can make A2G decisions — OpenAI Decisions, TypeSafe Jev and open Jev-compatible models such as Kev, Laya and decider, general LLMs and local policies — and how each is connected.
sidebar:
  order: 4
---

The protocol does not name a model. A **decision provider** is anything that, given context and a list of options, returns one option — ideally with probabilities. The decision service hides the provider from the game: switching providers changes service configuration, not game code.

:::note[Status]
The 0.1 reference service supports **OpenAI Decisions** only. Other providers below are described as integration designs.
:::

## Comparison

| Provider | Kind | Output | Cost | Latency | Offline |
| --- | --- | --- | --- | --- | --- |
| [OpenAI Decisions](#openai-decisions) | Typed-decision API | choice + probabilities + confidence | $0.10 / 1M input, output free | "~10× faster than Responses" (no ms figure published) | no |
| [TypeSafe Jev](#typesafe-jev) | Typed-decision API (System One) | choice + probabilities + confidence | $0.042 / 1M input, output free | ~100–150 ms typical; 16 questions ≈ 0.3 s | no |
| [Jev-compatible open models](#jev-compatible-open-models) | Open typed-decision models on the System One API | choice + probabilities + confidence | your hardware | ~3–40 ms per question on a datacenter GPU; ~0.1–0.7 s on CPU or a Mac | yes |
| [General LLM](#general-llm-with-structured-output) | Chat model with JSON schema / enum | choice (probabilities rarely) | input + output | typically slower; varies by model | no |
| [Local general model](#local-general-model) | Small chat model on your hardware | choice | hardware only | depends on hardware | yes |
| [Local policy](#local-policy) | Small model trained on logged decisions | choice + probabilities | ~0 | < 1 ms | yes, in the game |

## How a decide request maps to a provider

The service turns one [decide](/specification/decide/) batch into **one provider request**:

- **Shared context** — world text, world state, scope and profile text — becomes the provider's input/state.
- **Each entity** becomes one typed choice question. Its options are exactly the entity's `legal_actions`, described with the manifest's action descriptions.
- The answer's choice becomes `action`; the provider's confidence becomes `confidence`. A refusal or an option outside `legal_actions` becomes `FALLBACK` for that entity only.

Both typed-decision APIs evaluate all questions against the same input in parallel, so batching many entities into one request is cheaper and barely slower than asking about one.

## OpenAI Decisions

- **Endpoint:** `POST https://api.openai.com/v1/decisions` (public beta), model `gpt-6-luna`.
- **Request:** `input` (shared context) and `questions[]`, each `{type: "choice", name, instructions, choices: [{value, description}]}`.
- **Response:** `answers[]` with `choice`, `probabilities` and `confidence`, or `type: "refusal"`.
- **Key:** create one in the OpenAI dashboard; the service reads `OPENAI_API_KEY`.
- **Limits:** questions per request and Decisions-specific rate limits are not documented; `gpt-6-luna` model limits follow your OpenAI usage tier (from 5,000 requests/min and 2M tokens/min on the entry tier). Access may still be gated during the beta.
- **Docs:** [Decisions guide](https://developers.openai.com/api/docs/guides/decisions).

This is the provider used by the reference service and the [Lango example](/examples/lango/).

## TypeSafe Jev

- **Endpoint:** `POST https://api.typesafe.ai/v1/systemone`, model `jev-latest` (currently `jev-1.13.0`; pin a version when tuning confidence thresholds).
- **Request:** `state` (shared context) and `questions` as a map `{id: {type: "choice", instructions, criteria: {option: description}}}`. Up to 255 options per choice.
- **Response:** `answers` by id with `choice`, `probabilities` and `confidence`, plus `usage.input_tokens`.
- **Key:** create one at [console.typesafe.ai/keys](https://console.typesafe.ai/keys); the service would read `TYPESAFE_API_KEY`.
- **Limits:** 64k tokens per request; by default 100k tokens/s and 80 requests/s (higher on enterprise plans). Returns 429/529 under load — retry with backoff or fall back.
- **Notes:** the docs advise keeping the state focused, since unrelated content lowers accuracy — another reason to send only relevant objects.
- **Docs:** [TypeSafe API](https://docs.typesafe.ai/api.md).

Mapping is direct: `input` → `state`, `questions[].choices` → `criteria`, `name` → question id.

## Jev-compatible open models

TypeSafe's System One API (`POST /v1/systemone` with `state` and a map of typed `questions`) has become a de facto standard: a community of open models and runtimes speaks the same wire format, catalogued in [awesome-jev](https://github.com/yibie/awesome-jev) (600+ projects). For A2G this means **one provider adapter covers TypeSafe Jev and every compatible model** — switching is a base-URL change, and most of them run locally, offline and free per decision.

They fit A2G's request shape directly: one shared `state` (world, scopes, profiles, all entities in the batch) and one Choice question per entity whose criteria are its `legal_actions`. Every answer carries a probability per option and a confidence.

The seven best fits, by adoption and suitability:

| Model / runtime | What it is | Adoption¹ | Speed | Runs on | License | Fit |
| --- | --- | --- | --- | --- | --- | --- |
| [Kev](https://github.com/jaredpalmer/kev) | Open model family (0.8B–27B) + server; drop-in for the TypeSafe SDK | ~9k ★; Kev-4B ~22k downloads/month | Kev-4B: 6 questions in ~18 ms on H100; ~0.7 s for 5 on Apple M5 | 4 GB GPU / any Apple Silicon (0.8B); L40S, H100 or 32 GB Mac (4B) | Apache-2.0 | ★★★★★ |
| [llama.cpp `/v1/systemone`](https://huggingface.co/blog/ggml-org/decision-models-in-llamacpp) | The most used local runtime, now serving decision models (GGUF) on the same endpoint | ~131k ★ | Per question on one RTX PRO 6000: Laya 5 ms, Kev-4B 12 ms | CPU, CUDA, Metal | MIT (check each model) | ★★★★★ |
| [Laya](https://github.com/NandhaKishorM/laya) | Non-autoregressive encoder (421M), Python/Node/ONNX, MLX port | ~33k ★; ~45k downloads/month | 7 ms/question batched on T4; ~13 ms on Apple Silicon (MLX) | CPU, GPU, Apple Silicon, browser | Apache-2.0 | ★★★★ |
| [decider](https://github.com/Mapika/decider) | Open models (2B–31B) + SDK and server; game demos (Tetris, Pong, Connect Four) | ~1k ★; decider-2b ~330k downloads/month | 2B GGUF on 8 CPU threads: 0.12–0.31 s | CPU (GGUF via library), ~4 GB GPU (2B) | Apache-2.0 | ★★★★ |
| [NeoHorse-Jev-4B](https://github.com/TokenRhythm/NeoHorse) | 4B open model; vLLM/SGLang or native runtime; includes game evaluations | ~1.7k ★ | not documented | GPU | Apache-2.0 | ★★★ |
| [NanoJev](https://github.com/TianyuCodings/NanoJev) | 0.6B model with decision heads, trained per task; batches many states in one pass | ~2.5k ★ | not documented | small GPU | MIT (code) | ★★★ |
| [jevlike](https://github.com/vinnylarouge/jevlike) | Library for tiny trained scorers (e.g. a 0.7M-parameter, 2.8 MB model) — down to microcontrollers | ~1.4k ★ | sub-millisecond class | anything, incl. ESP32 | MIT | ★★★ |

¹ GitHub stars and Hugging Face downloads as seen on 2026-10-12. Quality figures in these projects are mostly self-reported; evaluate on your own game.

**How to choose**

- **Kev** — the default local choice: same API as Jev, calibrated probabilities, runs on a developer's Mac, and can be fine-tuned on your game's logged decisions. At 4B its accuracy is below Jev's; the 27B is close to it.
- **llama.cpp** — the easiest way to serve Kev, Laya and others behind one binary on any hardware. The endpoint is new (October 2026), so pin a version.
- **Laya** — when speed or CPU-only matters most. Its English context is 512 tokens and all option labels share a small budget, so keep observations compact and options few; it works best after fine-tuning on your domain.
- **decider** — CPU-friendly and built with games in mind; serve GGUF through its library.
- **NeoHorse, NanoJev, jevlike** — less a general provider than a path to a [local policy](/design/local-policy/): small models trained on your game's decisions that can beat a general model on that one game, and ship inside it.

**Caveats**

- The format takes **one state per request**. A2G already puts the whole batch into one state with one question per entity; providers that accept several states (Laya's `/predict/batch`, NanoJev) are an optimisation, not a requirement.
- Check each model's license before shipping: some decision models (for example OpenJev-27B, CC BY-NC) forbid commercial use.
- Hosted gateways (OpenRouter, Vercel AI Gateway, Cloudflare Workers AI) also expose Jev itself; their prices vary and are not a reason to choose them over the TypeSafe API.

## General LLM with structured output

Any chat model that supports a JSON schema with an `enum` of the legal actions can act as a provider: one prompt with the context, a schema with one enum field per entity.

- **Pros:** any vendor or model, can be swapped freely; works where typed-decision APIs are unavailable.
- **Cons:** output tokens are billed; slower; usually no calibrated probabilities, so `confidence` is `null`; refusals and malformed output must be handled.
- **Best for:** rare, high-stakes decisions (a director, a story character) where a stronger reasoning model is worth the cost.

## Local general model

A small general chat model served on your own hardware (for example through an OpenAI-compatible local server) with the same structured-output approach. Prefer a [Jev-compatible open model](#jev-compatible-open-models) when you can: it returns real probabilities and is built for the job.

- **Pros:** no per-decision fee, works without internet, data stays local.
- **Cons:** you run and scale the hardware; quality depends on the model; GPU cost replaces API cost.
- **Best for:** dedicated servers, offline builds, privacy-sensitive deployments.

## Local policy

Not a model call at all: a small classifier per entity type, trained on logged context → decision → outcome data from [reports](/specification/report/), shipped inside the game or the service.

- **Pros:** free, instant, offline, deterministic.
- **Cons:** only as good as the data; needs retraining when the game changes; no understanding of new text.
- **Best for:** the common cases, with a model handling the rest — or all cases in a shipped offline game. See [Local policy](/design/local-policy/) and [Policy format](/specification/policy-format/).

## Combining providers (proposed)

A service can route by importance and confidence:

```text
local policy ── confident? ─▶ use it
       │ no
       ▼
local Jev-compatible model (Kev, Laya…) ── confident? ─▶ use it
       │ no
       ▼
typed-decision API (Decisions / Jev) ── confident? ─▶ use it
       │ no, and the entity is important
       ▼
reasoning LLM ─▶ use it          any failure at any step ─▶ FALLBACK (native AI)
```

Proposed service configuration:

```json
{
  "providers": {
    "local": { "kind": "systemone", "base_url": "http://127.0.0.1:8080", "model": "kev-4b" },
    "fast":  { "kind": "systemone", "base_url": "https://api.typesafe.ai", "model": "jev-1.13.0", "key_env": "TYPESAFE_API_KEY" },
    "main":  { "kind": "openai-decisions", "model": "gpt-6-luna", "key_env": "OPENAI_API_KEY" },
    "smart": { "kind": "llm-structured", "model": "<any>", "key_env": "LLM_API_KEY" }
  },
  "routing": { "default": ["local", "fast"], "crowd": ["local"], "boss": ["fast", "main", "smart"] },
  "failover": true
}
```

## Where keys live

- Keys are configured **only in the decision service** — environment variables or a secret manager.
- A game build never contains a provider key. Hosted services give the game a short-lived session token instead.
- A studio can use its own provider accounts ("bring your own key") or a hosted A2G account.
