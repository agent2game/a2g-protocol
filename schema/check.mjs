// Validates schema/<version>/examples/<Definition>/*.json (must pass) and invalid/<Definition>/*.json (must fail)
// against the matching $defs entry of a2g.schema.json. Exit code 1 on any mismatch.
import Ajv2020 from 'ajv/dist/2020.js';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

let failures = 0;
for (const version of readdirSync('.').filter((name) => /^\d+\.\d+$/.test(name))) {
	const schema = JSON.parse(readFileSync(join(version, 'a2g.schema.json'), 'utf8'));
	const ajv = new Ajv2020({ allErrors: true, strict: true });
	ajv.addSchema(schema);
	for (const [folder, shouldPass] of [['examples', true], ['invalid', false]]) {
		const root = join(version, folder);
		if (!existsSync(root)) continue;
		for (const definition of readdirSync(root)) {
			if (!schema.$defs[definition]) {
				console.error(`✗ ${root}/${definition}: no $defs.${definition} in the schema`);
				failures++;
				continue;
			}
			const validate = ajv.getSchema(`${schema.$id}#/$defs/${definition}`);
			for (const file of readdirSync(join(root, definition))) {
				const ok = validate(JSON.parse(readFileSync(join(root, definition, file), 'utf8')));
				const label = `${version}/${folder}/${definition}/${file}`;
				if (ok === shouldPass) console.log(`✓ ${label}`);
				else {
					failures++;
					console.error(`✗ ${label}: expected ${shouldPass ? 'valid' : 'invalid'}`, shouldPass ? ajv.errorsText(validate.errors) : '');
				}
			}
		}
	}
}
if (failures) process.exit(1);
console.log('Schema check passed.');
