// Builds /llms.txt (index) and /llms-full.txt (all docs) from the docs collection at build time,
// so the agent-facing files can never drift from the pages. Spec: https://llmstxt.org
import { getCollection, type CollectionEntry } from 'astro:content';

type Doc = CollectionEntry<'docs'>;

// Section order mirrors the sidebar in astro.config.mjs.
const SECTIONS: [string, (id: string) => boolean][] = [
	['Get started', (id) => id.startsWith('docs/') || id.startsWith('guides/')],
	['Specification', (id) => id.startsWith('specification/')],
	['Design', (id) => id.startsWith('design/')],
	['Implementations', (id) => id.startsWith('implementations/')],
	['Examples', (id) => id.startsWith('examples/')],
	['Reference', (id) => ['faq', 'glossary', 'roadmap', 'about'].includes(id)],
];

const url = (site: URL, id: string) => new URL(id === 'index' ? '/' : `/${id}/`, site).href;
// Pages listed by hand in the sidebar have no `order`; keep their sidebar sequence.
const PINNED = ['docs/introduction', 'docs/architecture', 'guides/integrate', 'faq', 'glossary', 'roadmap', 'about'];
const order = (doc: Doc) => doc.data.sidebar?.order ?? (PINNED.indexOf(doc.id) + 1 || 999);

async function sections() {
	const docs = await getCollection('docs');
	return SECTIONS.map(([name, match]) => [
		name,
		docs.filter((d) => match(d.id)).sort((a, b) => order(a) - order(b) || a.data.title.localeCompare(b.data.title)),
	] as const);
}

// MDX pages contain imports and components; keep their text, drop the markup.
function clean(body: string, site: URL) {
	return body
		.replace(/^import .*$/gm, '')
		.replace(/<Card title="([^"]+)"[^>]*>/g, '**$1**:')
		.replace(/<\/?(CardGrid|Card|Steps|Architecture|MessageFlow|Faq)[^>]*>/g, '')
		.replace(/\]\(\//g, `](${site.origin}/`)
		.replace(/\n{3,}/g, '\n\n')
		.trim();
}

const HEADER = (site: URL) => `# Agent2Game (A2G)

> An open protocol that lets existing games ask an AI model what their characters should do next, while the game stays authoritative: the game describes itself in a manifest, sends observations and legal actions, executes validated typed choices through its own code and falls back to its native AI on any failure. Protocol version 0.1 (draft).

Pages marked "Proposed: not implemented yet" describe planned parts. The complete documentation in one file: ${new URL('/llms-full.txt', site).href}. Machine-readable JSON Schema of the manifest and all messages: ${new URL('/schema/0.1/a2g.schema.json', site).href}. Source: https://github.com/agent2game/a2g-protocol
`;

export async function llmsIndex(site: URL) {
	const parts = [HEADER(site)];
	for (const [name, docs] of await sections()) {
		parts.push(`## ${name}\n\n` + docs.map((d) => `- [${d.data.title}](${url(site, d.id)}): ${d.data.description ?? ''}`).join('\n'));
	}
	return parts.join('\n\n') + '\n';
}

export async function llmsFull(site: URL) {
	const parts = [HEADER(site)];
	for (const [, docs] of await sections()) {
		for (const d of docs) parts.push(`---\n\n# ${d.data.title}\n\nSource: ${url(site, d.id)}\n\n${clean(d.body ?? '', site)}`);
	}
	return parts.join('\n\n') + '\n';
}
