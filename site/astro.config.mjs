// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://agent2game.org',
	// Component CSS goes to files under 'self': Astro does not add CSP hashes for inlined component <style> tags.
	build: { inlineStylesheets: 'never' },
	// Content-Security-Policy as a <meta> tag with hashes of every inline script and style Astro emits.
	// 'wasm-unsafe-eval' is needed by the Pagefind search index; /link-preview.js is served from 'self'; small font
	// subsets are inlined as data: URIs by the bundler. Google Analytics (owner's decision) loads gtag.js from
// www.googletagmanager.com and sends hits to the *.google-analytics.com hosts below; /analytics.js configures it.
	security: {
		csp: {
			directives: ["default-src 'self'", "img-src 'self' data: https://*.google-analytics.com https://*.googletagmanager.com", "font-src 'self' data:",
				"connect-src 'self' https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com", "object-src 'none'", "base-uri 'self'", "form-action 'self'"],
			scriptDirective: {
				resources: ["'self'", "'wasm-unsafe-eval'", 'https://www.googletagmanager.com'],
				// Starlight's is:inline scripts (theme, search modal, sidebar scroll) are not hashed by Astro.
				// ponytail: pinned per Starlight version; `npm run build` fails with the new hashes when they change.
				hashes: [
					'sha256-VWo5Wp4aqSj6nSgMpeAp9cKieaoIfwFUAunAVugI5gA=',
					'sha256-f/zAUE74ucc3JYp4r4QQvkJofoQdkOIhHYK+jeZ6eko=',
					'sha256-GkZBRnvSuhtx/cvzvukVkX2JJZW+DdPlVr7BX8Tefqo=',
					'sha256-wX2yOADeV+NMngflD5uYi3vl50SHC4sfM1EmylVjlX4=',
					'sha256-7eCV4jtsr4t4knb3c4FCRPeu7GGZeOUGE3XvWix0XOQ=',
				],
			},
			// <style> elements stay hash-locked; code highlighting needs inline style="" attributes (low risk: no script).
			styleDirective: { resources: ["'self'", { kind: 'attribute', resource: "'unsafe-inline'" }] },
		},
	},
	integrations: [
		starlight({
			title: 'Agent2Game',
			description: 'An open protocol for plugging AI decisions into existing games.',
			// Fonts are self-hosted; the only third-party requests are Google Analytics.
			customCss: ['@fontsource-variable/inter', '@fontsource-variable/pixelify-sans', '@fontsource/jetbrains-mono/400.css', '@fontsource/jetbrains-mono/500.css', './src/styles/custom.css'],
			lastUpdated: true,
			components: { SiteTitle: './src/components/SiteTitle.astro', Hero: './src/components/Hero.astro' },
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/agent2game/a2g-protocol' }],
			editLink: { baseUrl: 'https://github.com/agent2game/a2g-protocol/edit/main/site/' },
			head: [
				{ tag: 'script', attrs: { src: '/link-preview.js', defer: true } },
				{ tag: 'script', attrs: { src: 'https://www.googletagmanager.com/gtag/js?id=G-B12Z880MB9', async: true } },
				{ tag: 'script', attrs: { src: '/analytics.js' } },
			],
			sidebar: [
				{
					label: 'Get started',
					items: ['docs/introduction', 'docs/architecture', 'guides/integrate', 'guides/behavior'],
				},
				{
					label: 'Specification',
					items: [{ autogenerate: { directory: 'specification' } }],
				},
				{
					label: 'Design',
					items: [{ autogenerate: { directory: 'design' } }],
				},
				{
					label: 'Implementations',
					items: [{ autogenerate: { directory: 'implementations' } }],
				},
				{
					label: 'Examples',
					items: [{ autogenerate: { directory: 'examples' } }],
				},
				{ label: 'Glossary', slug: 'glossary' },
				{ label: 'Roadmap', slug: 'roadmap' },
				{ label: 'About', slug: 'about' },
				{ label: 'For AI agents (llms.txt)', link: '/llms.txt', attrs: { target: '_self' } },
			],
		}),
	],
});
