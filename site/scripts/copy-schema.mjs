// Publishes the protocol JSON Schema at its $id (https://agent2game.org/schema/<version>/a2g.schema.json).
import { cpSync, readdirSync } from 'node:fs';

for (const version of readdirSync('../schema').filter((name) => /^\d+\.\d+$/.test(name))) {
	cpSync(`../schema/${version}/a2g.schema.json`, `public/schema/${version}/a2g.schema.json`);
}
