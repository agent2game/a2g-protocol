---
title: POST /v1/session
description: Start a session by announcing the game, protocol version and manifest.
sidebar:
  order: 3
---

Sent once when the game starts, and again whenever the service answers `409` (for example, after a service restart).

## Request

```http
POST /v1/session
Authorization: Bearer <api key | join token>
```

The credential depends on the [deployment profile](/specification/security/#deployment-profiles): none in `local`, an API key in `server`, a short-lived join token in `client`.

```json
{
  "a2g": "0.1",
  "client_id": "lango-5f2c91",
  "game": "Lango",
  "engine": "Godot 4.5.1.stable",
  "manifest": { "...": "see Manifest" }
}
```

| Field | Notes |
| --- | --- |
| `a2g` | Protocol version the game speaks. Must match the service. |
| `client_id` | Identifier of this game process |
| `game`, `engine` | Display names, ≤ 80 chars |
| `manifest` | See [Manifest](/specification/manifest/) |

## Response

```json
{ "a2g": "0.1", "ok": true, "manifest_hash": "sha256:9f2c…", "session_token": "s_7Hq…", "expires_in": 3600 }
```

| Field | Notes |
| --- | --- |
| `manifest_hash` | The [manifest hash](/specification/manifest/#manifest-hash): SHA-256 of the canonical manifest without `scopes` and `profiles`. Identifies the manifest version for the decision cache, logs and tools |
| `session_token` | Opaque token bound to this `client_id`. Send it as `Authorization: Bearer` on every later request. Omitted in the `local` profile |
| `expires_in` | Seconds until the token expires; open a new session before then |

A `400` means the version is unsupported or the manifest is invalid; the message names the problem. `401` means the credential is missing or invalid; `403` that the game or manifest hash is not registered with the service. Sending a new session replaces the stored manifest (including its scopes and profiles) for that client. Scopes and profiles can then be changed with [`POST /v1/context`](/specification/context/).

## Proposed: local policy fields

:::caution[Proposed: not implemented yet]
Part of the planned [local policy](/design/local-policy/). The protocol version stays 0.1.
:::

```json
{
  "a2g": "0.1",
  "client_id": "…",
  "manifest": { "…": "…" },
  "policy_version": "2026-10-12.3"
}
```

| Field | Notes |
| --- | --- |
| `policy_version` | Version of the local policy the game loaded, if any. Lets the console compare policy versions. |
