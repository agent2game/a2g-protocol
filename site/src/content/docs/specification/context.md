---
title: POST /v1/context
description: Add, replace or remove scopes and profiles during a session, for example when a level loads.
sidebar:
  order: 4
---

A game rarely knows every level and character at start. `/v1/context` updates the session's [scopes](/specification/manifest/#scopes) and [profiles](/specification/manifest/#profiles) without resending the manifest.

## Request

Except in the `local` profile, every request MUST include `Authorization: Bearer <session_token>` (see [Security](/specification/security/#authentication)). In the `client` profile only scopes and profiles registered with the manifest may be activated; free-form updates need the `server` or `local` profile ([registered manifests](/specification/security/#registered-manifests)).

```json
{
  "client_id": "lango-5f2c91",
  "scopes": {
    "cave": { "text": "Dark caves. Bats hunt by sound and ignore the repellent here.", "fields": { "torch_lit": "boolean" } },
    "forest_boss": null
  },
  "profiles": {
    "old_bat": { "type": "bat", "text": "Half-blind veteran of the caves; attacks only wounded intruders." }
  }
}
```

| Field | Notes |
| --- | --- |
| `scopes` | Name → scope (same shape as in the manifest) adds or replaces it; name → `null` removes it |
| `profiles` | Name → profile adds or replaces it; name → `null` removes it |

Both are optional, but at least one must be present.

## Rules

- The result must stay valid as a whole: every scope's `parent` exists, every profile's `type` is an entity type of the manifest, there are no cycles, field names are unique along each chain, and the limits of 64 scopes and 256 profiles hold. Otherwise the whole update is rejected with `400` and nothing changes.
- A scope cannot be removed while another scope names it as `parent` in the same result.
- Changes apply to decide requests received after the response. Requests that name a removed scope or profile are rejected with `400`.
- Updates are part of the session. When the game resends [`/v1/session`](/specification/session/) (for example after a `409`), it must include the current scopes and profiles in the manifest or send `/v1/context` again.
- Scopes and profiles do not change the [manifest hash](/specification/manifest/#manifest-hash). Their texts are part of the [decision cache](/specification/manifest/#decision-cache) key, so editing a text never reuses decisions made under the old one.

## Response

```json
{ "ok": true, "scopes": 5, "profiles": 12 }
```

`scopes` and `profiles` are the counts after the update.
