---
title: Policy format
description: The portable file format for local policies — inputs, model kinds, evaluation rules and conformance vectors that every SDK must pass.
sidebar:
  order: 10
---

:::caution[Proposed — not implemented yet]
Part of the planned [local policy](/design/local-policy/). The protocol version stays 0.1.
:::

A **policy file** (`a2g_policy.json`) contains one trained model per entity type. Any SDK can evaluate it with plain arithmetic — no machine-learning runtime is needed. Given an entity's observation, the world state and the legal actions, it returns the same thing a [decision](/specification/decide/) does: an action, probabilities and a confidence.

## File structure

```json
{
  "a2g_policy": "0.1",
  "manifest_hash": "sha256:9f2c…",
  "version": "2026-10-12.3",
  "created_at": "2026-10-12T18:40:00Z",
  "teacher": { "provider": "openai-decisions", "model": "gpt-6-luna" },
  "trained_on": 4210,
  "types": {
    "bee": {
      "actions": ["chase", "flee", "idle", "wander"],
      "inputs": [
        { "source": "observation", "name": "hp_fraction", "kind": "number" },
        { "source": "observation", "name": "distance_to_player", "kind": "number", "offset": 0, "scale": 0.005 },
        { "source": "observation", "name": "sees_player", "kind": "boolean" },
        { "source": "observation", "name": "current_action", "kind": "enum", "values": ["idle", "wander", "chase", "flee"] },
        { "source": "world", "name": "player_hp_fraction", "kind": "number" }
      ],
      "model": { "kind": "tree", "root": { "...": "see below" } },
      "metrics": { "agreement": 0.91, "samples": 1830, "holdout": 366 }
    }
  }
}
```

| Key | Meaning |
| --- | --- |
| `a2g_policy` | Version of this format |
| `manifest_hash` | SHA-256 of the canonical manifest JSON. The SDK refuses a policy whose hash differs from the game's manifest. |
| `version`, `created_at`, `teacher`, `trained_on` | Provenance for debugging and rollbacks |
| `types.<type>.actions` | Output order. Every model output vector follows it. |
| `types.<type>.inputs` | How to build the input vector (below) |
| `types.<type>.model` | One of the model kinds below |
| `types.<type>.metrics` | Training report summary; informational |

A type missing from `types` has no local policy and uses native AI.

## Building the input vector

Inputs are appended in order to a vector `x` of 32-bit floats:

| `kind` | Contributes | Value |
| --- | --- | --- |
| `number` | 1 element | `(value − offset) × scale`; `offset` defaults to 0, `scale` to 1 |
| `boolean` | 1 element | `1` for true, `0` for false |
| `enum` | one element per listed value | one-hot in `values` order; an unknown value gives all zeros |

`source` is `observation` (the entity's fields) or `world` (shared fields). If any listed field is missing, the policy has no answer for that entity and the SDK falls back.

## Model kinds

Each model produces a vector over `actions`.

**`tree`** — one decision tree.

```json
{ "kind": "tree",
  "root": { "feature": 2, "threshold": 0.5,
            "left":  { "value": [0.0, 0.0, 0.7, 0.3] },
            "right": { "feature": 0, "threshold": 0.3,
                       "left":  { "value": [0.1, 0.8, 0.05, 0.05] },
                       "right": { "value": [0.85, 0.05, 0.05, 0.05] } } } }
```

At an internal node go `left` if `x[feature] <= threshold`, otherwise `right`. A leaf's `value` is a probability vector.

**`forest`** — `{ "kind": "forest", "trees": [root, …] }`. The output is the element-wise mean of the trees' leaf values.

**`gbdt`** — gradient-boosted trees: `{ "kind": "gbdt", "base": [...], "learning_rate": 0.1, "trees": [root, …] }`. Leaf values are logit increments; `logits = base + learning_rate × Σ leaf values`, then softmax.

**`mlp`** — a small neural network:

```json
{ "kind": "mlp",
  "layers": [
    { "weights": [[...], ...], "bias": [...], "activation": "relu" },
    { "weights": [[...], ...], "bias": [...], "activation": "linear" } ] }
```

`weights` is `outputs × inputs`; each layer computes `activation(weights · x + bias)`. The final layer has as many outputs as `actions`; softmax turns them into probabilities. Activations: `relu`, `tanh`, `linear`.

## From probabilities to a decision

1. Compute probabilities `p` over `actions` with the model.
2. **Mask:** set `p[a] = 0` for every action not in the entity's current `legal_actions`.
3. If the sum is 0, there is no answer — fall back. Otherwise renormalize so it sums to 1.
4. `action` = the highest probability; ties go to the earlier action in `actions`.
5. `confidence = (max(p) − 1/n) / (1 − 1/n)`, where `n` is the number of legal actions; `confidence = 1` when `n = 1`. This matches the confidence of typed-decision providers.

In `cascade` mode the SDK accepts the local answer only if `confidence` reaches the configured threshold; otherwise it asks the service.

## Numeric rules

- Use 32-bit floats for inputs, weights and arithmetic where the engine allows it.
- Results may differ between engines in the last digits. Single-player games can accept that. In multiplayer, decisions are made on the server and replicated.

## Conformance vectors

The specification ships `policy-conformance.json`: a set of small policies and inputs with expected outputs. Every SDK must reproduce them within the given tolerance before it can claim support for the format.

```json
{
  "cases": [
    {
      "name": "tree: masked to idle/wander",
      "policy": "policies/tree-basic.json",
      "type": "bee",
      "observation": { "hp_fraction": 0.2, "distance_to_player": 140, "sees_player": false, "current_action": "chase" },
      "world": { "player_hp_fraction": 1.0 },
      "legal_actions": ["idle", "wander"],
      "expected": { "action": "idle", "probabilities": { "idle": 0.7, "wander": 0.3 }, "confidence": 0.4 },
      "tolerance": 1e-5
    }
  ]
}
```

## Optional ONNX export

For larger models in engines with a built-in ONNX runtime (Unity, Unreal), a policy type may also reference an ONNX file with the same `inputs` and `actions`. The JSON model remains required so every SDK can run the policy.
