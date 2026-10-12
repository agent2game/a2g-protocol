// Fails the build if any inline <script> or <style> in dist/ is not allowed by the page's CSP hashes.
// Starlight ships a few `is:inline` scripts that Astro does not hash; their hashes are pinned in astro.config.mjs
// and must be updated when Starlight changes them. This check tells you which ones.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const pages = (dir) => readdirSync(dir).flatMap((name) => {
	const path = join(dir, name);
	return statSync(path).isDirectory() ? pages(path) : path.endsWith('.html') ? [path] : [];
});

const missing = new Map();
for (const page of pages('dist')) {
	const html = readFileSync(page, 'utf8');
	const csp = html.match(/http-equiv="content-security-policy" content="([^"]+)"/i)?.[1] ?? '';
	const hashes = (directive) => new Set([...(csp.match(new RegExp(`${directive} ([^;]+)`))?.[1] ?? '').matchAll(/'(sha256-[^']+)'/g)].map((m) => m[1]));
	const checks = [['script-src', /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g], ['style-src', /<style[^>]*>([\s\S]*?)<\/style>/g]];
	for (const [directive, pattern] of checks) {
		const allowed = hashes(directive);
		for (const [, body] of html.matchAll(pattern)) {
			const hash = 'sha256-' + createHash('sha256').update(body).digest('base64');
			if (!allowed.has(hash)) missing.set(hash, `${directive} ${page}: ${body.trim().slice(0, 60)}`);
		}
	}
}

if (missing.size) {
	console.error(`CSP: ${missing.size} inline script(s)/style(s) without a hash. Scripts: add to security.csp.scriptDirective.hashes in astro.config.mjs; styles: keep build.inlineStylesheets 'never'.`);
	for (const [hash, where] of missing) console.error(`  '${hash}'  // ${where}`);
	process.exit(1);
}
console.log('CSP: every inline script and style is hash-allowed.');
