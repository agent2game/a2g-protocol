---
title: Introduction
description: What Agent2Game is, which parts it consists of and who builds each of them.
---

**Agent2Game (A2G)** is an open protocol for connecting AI decision-making to existing games. A game describes itself once in a [manifest](/glossary/#manifest), sends [observations](/glossary/#observation) for its [entities](/glossary/#entity), receives one typed choice per entity from the [actions it allowed](/glossary/#legal-actions), executes valid choices through its own code and [reports](/glossary/#report) the outcome.

## The problem

Most game behavior is a finite-state machine written specifically for one game. Replacing it with an AI model is tempting, but doing it naively breaks things games rely on: safe fallbacks, frame budgets, input validation and the ability to see why a character did what it did. Every integration also tends to be bespoke.

## The parts

A2G separates **what is agreed** from **who implements it**:

| Part | What it is | Who builds it |
| --- | --- | --- |
| **Protocol** | The contract: manifest format, messages, fallback rules. Language- and engine-neutral. | A2G (this site) |
| **Engine SDK** | Client library for one engine. Handles sessions, batching, timing, reports and telemetry. Knows nothing about a specific game. | A2G provides reference SDKs; anyone can write one for another engine |
| **Adapter + manifest** | The game-specific part: what entities observe, which actions are legal now, how to execute them. | The game developer |
| **Decision service** | Server that validates requests, keeps entity memory, holds provider keys and calls the model. | A2G provides a reference service; anyone can implement the protocol |
| **Model provider** | The model API that picks the action. | Third party |
| **Local policy** *(proposed)* | A small model trained on the provider's decisions and shipped inside the game; works offline at no per-decision cost. | Trained by A2G tooling from the developer's playtests |

A game developer normally writes only the **manifest and adapter**. See [Implementations](/implementations/godot-sdk/) for what is available and [Integrate a game](/guides/integrate/) for the steps.

## Principles

- **The game is authoritative.** Movement, collision, damage and rules stay in the game. The model never touches game state directly.
- **The original behavior is the default.** AI control is opt-in, and any failure returns control to the game's own logic ([fallback](/glossary/#fallback)).
- **Choices are closed and typed.** The game offers the actions legal right now; the model picks one. No free-form commands.
- **Game-agnostic service.** Everything the service knows about a game comes from its manifest.
- **Keys stay out of the game.** Provider credentials live in the decision service, never in the game build.
- **Ship without the cloud.** *(Proposed.)* The large model can be a development tool: a [local policy](/design/local-policy/) trained on its decisions runs in the shipped game.
- **Observable by design.** Service health, provider replies, chosen actions and actually executed states are reported separately.

## Status

:::note
A2G **0.1** is a draft, validated end to end on one game ([example](/examples/lango/)). Portability to other games and measured benefit over native AI are not yet demonstrated. See the [roadmap](/roadmap/).
:::
