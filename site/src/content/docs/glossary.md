---
title: Glossary
description: Short definitions of A2G terms. Links to these terms show the definition on hover.
---

Each term's first paragraph is what appears in hover previews across the site, so keep it to one or two sentences.

## Manifest

The game's self-description sent in the session: world text, world fields, entity types with their observation fields and actions. The service knows nothing about a game beyond it.

See [Manifest](/specification/manifest/).

## Session

The registration of one running game process with the service: protocol version, game name, engine and manifest. Sent at start and after a `409`.

## Entity

One decision-making object in the game, such as an enemy or NPC. Identified by an `id` that is unique within the client.

## Entity type

A kind of entity declared in the manifest, with its description, observation fields, actions and decision TTL.

## Observation

What one entity currently perceives, sent as exactly the fields its type declares.

## World state

Values shared by all entities, sent with every decide request as exactly the manifest's `world_fields`.

## Legal actions

The subset of a type's actions that the game allows for an entity right now. The provider may only choose from it.

## Decision

The service's answer for one entity: an action with `source: AI`, or `source: FALLBACK` when no valid choice was made.

## Decision slot

One of several independent choices an entity makes at the same time, such as how hard to work and whether to ask for a raise in the same week. Declared with `decisions` in the manifest; each slot has its own actions and is decided separately. See [decision slots](/specification/manifest/#decision-slots).

## Epoch

A counter the game increments when context is invalidated, for example on a mode switch or scene change. Replies with an old epoch are discarded.

## TTL

How long a decision stays valid (`decision_ttl_ms`). After it, the entity returns to native AI until a new decision arrives.

## Fallback

Running the game's native AI because no fresh, valid decision exists. The default, safe behavior.

## Native AI

The game's original behavior, usually a finite-state machine (FSM). A2G never replaces it, only overrides it while a valid decision is fresh.

## Report

The game's message about how a decision ended (executed, blocked or expired) with a few outcome values.

## Memory

The last reports of an entity, kept by the service and shown to the provider with the next decision for that entity.

## Telemetry

A once-per-second snapshot of mode, world and entities with their actual states. Used for observability, never for decisions.

## SDK

Engine-specific, game-agnostic client code: sessions, batching, epochs, TTL, reports and telemetry.

## Adapter

The small game-specific code a developer writes: observe an entity, list its legal actions, execute an action.

## Local policy

A small model trained on the decision service's logged decisions and evaluated inside the game. Lets a game decide offline at no per-decision cost. Proposed; see [Local policy](/design/local-policy/).

## Teacher

The large model whose decisions a local policy learns from, such as OpenAI Decisions or TypeSafe Jev.

## Policy format

The portable JSON file format for local policies: inputs, model (tree, forest, gbdt or mlp) and actions. Any SDK evaluates it with plain arithmetic.

## Conformance vectors

Reference inputs with expected outputs that every SDK must reproduce, so one policy file behaves the same in every engine.

## Manifest hash

SHA-256 of the canonical manifest JSON without scopes and profiles, returned by `/v1/session`. Identifies one version of a game's manifest for the decision cache, logs and local policies.

## Data epoch

A label the developer starts after a balance change, so decisions logged under old balance are excluded from training.

## Cascade mode

The local policy decides when its confidence reaches a threshold; otherwise the service is asked. The main mode for collecting training data.

## Shadow mode

The service decides while the local policy predicts alongside; agreement shows whether the policy is ready to ship.

## Scope

A named block of static context (a level, zone or chapter) sent once per request. Scopes form a chain from the world down; a decide request names the active one. See [Scopes](/specification/manifest/#scopes).

## Profile

Named static text about one character (name, role, personality) referenced by entities and sent once per request. See [Profiles](/specification/manifest/#profiles).

## Group

An entity linked to a higher-level entity (a squad, faction or director) by `parent`. Children see the parent's decision; the parent sees its members. See [Groups](/specification/decide/#groups).

## Event

A named reason, declared per entity type, for asking for a decision now instead of on the regular timer; sent as the request's `trigger`.

## Decision cache

Reuse of a recent decision for an equivalent situation, as defined by the type's cache `key` and `buckets`, shared by all sessions with the same manifest hash.

## Token budget

A per-type cap (`max_input_tokens`) on the entity-specific part of the model input; entities over it fall back with `code: "budget"`.

## Deployment profile

How a decision service is exposed and who may open sessions: `local` (loopback, development), `server` (game servers with an API key) or `client` (game clients with a short-lived join token). See [Security](/specification/security/#deployment-profiles).

## Session token

Opaque token returned by `/v1/session`, bound to one `client_id` and sent with every later request. Knowing a `client_id` alone grants nothing.

## Join token

Short-lived signed token a studio backend gives a game client so it can open a session without any secret in the game build.

## Decision id

Unique id of an `AI` decision. Reports must reference it, so fake or replayed reports cannot poison an entity's memory.
