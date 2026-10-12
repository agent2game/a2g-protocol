# Agent2Game (A2G) protocol

**A2G is an open protocol that lets existing games ask an AI model what their characters should do next, while the game stays in charge of what actually happens.**

A game describes itself once in a **manifest** (world, entity types, what each entity observes, which actions exist). It then sends observations and the actions legal right now; a decision service asks a model to pick one action per entity; the game validates each choice, executes it through its own code and reports the outcome. Any failure falls back to the game's original AI.

📖 **Documentation and specification:** https://agent2game.org
🤖 **For coding agents:** https://agent2game.org/llms-full.txt

> **Status:** protocol version **0.1**, draft. Breaking changes are expected. The specification leads the reference implementations; see the [implementation status](https://agent2game.org/implementations/service/#implementation-status).

## What is in this repository

| Path | Contents |
| --- | --- |
| [`site/`](site) | The documentation site and **normative specification** ([`site/src/content/docs/specification/`](site/src/content/docs/specification)) |
| [`schema/`](schema) | JSON Schema for the manifest and every message: [`schema/0.1/a2g.schema.json`](schema/0.1/a2g.schema.json), with valid and invalid examples |

SDKs for game engines, the reference decision service and example integrations live in separate repositories:

| Repository | Contents |
| --- | --- |
| [a2g-sdk-godot](https://github.com/agent2game/a2g-sdk-godot) | Godot 4 SDK (addon), demo, tests |
| [a2g-example-lango-godot](https://github.com/agent2game/a2g-example-lango-godot) | Lango, a Godot 4 RPG with AI-driven enemies |

Naming: SDKs are `a2g-sdk-<engine>`, examples `a2g-example-<game>-<engine>`.

## Using the schema

The schema is a single JSON Schema (draft 2020-12) with one definition per message: `Manifest`, `SessionRequest`, `DecideRequest`, `DecideResponse`, `ReportRequest`, `TelemetryRequest` and others. It is also served at its `$id`, `https://agent2game.org/schema/0.1/a2g.schema.json`.

```js
import Ajv2020 from 'ajv/dist/2020.js';
const schema = await (await fetch('https://agent2game.org/schema/0.1/a2g.schema.json')).json();
const ajv = new Ajv2020().addSchema(schema);
const validateManifest = ajv.getSchema(`${schema.$id}#/$defs/Manifest`);
```

The schema checks structure. Rules that depend on a specific manifest (exact observation fields, `legal_actions` being a subset of `actions`, scope chains, `decision_id` ownership) are enforced by services and SDKs as described in the specification.

## Contributing

Issues and pull requests are welcome. A change to the protocol updates the specification page, the schema and its examples together. Before opening a pull request:

```sh
cd schema && npm ci && npm test
cd site && npm ci && npm run build
```

To work on the site locally: `cd site && npm ci && npx astro dev` and open http://localhost:4321.

Security issues: see [SECURITY.md](SECURITY.md).

## License

[Apache License 2.0](LICENSE). Keep the [`NOTICE`](NOTICE) file when redistributing. You may say a product "implements A2G" or is "compatible with A2G" if it follows the specification.
