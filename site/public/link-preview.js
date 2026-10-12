// Hover previews for internal doc links: page links show the page description,
// links with #anchor show the first paragraph under that heading (see /glossary/).
(() => {
	const cache = new Map();
	const tip = document.createElement('div');
	tip.className = 'a2g-preview';
	tip.setAttribute('role', 'tooltip');
	tip.hidden = true;
	document.addEventListener('DOMContentLoaded', () => document.body.append(tip));

	const load = (path) => {
		if (!cache.has(path)) {
			cache.set(path, fetch(path).then((r) => (r.ok ? r.text() : '')).then((html) => new DOMParser().parseFromString(html, 'text/html')).catch(() => null));
		}
		return cache.get(path);
	};

	const extract = (doc, hash) => {
		if (!doc) return null;
		if (!hash) {
			const description = doc.querySelector('meta[name="description"]')?.content;
			return description && { title: doc.querySelector('h1')?.textContent, text: description };
		}
		const heading = doc.getElementById(decodeURIComponent(hash.slice(1)));
		if (!heading) return null;
		let node = (heading.closest('.sl-heading-wrapper') || heading).nextElementSibling;
		while (node && node.tagName !== 'P') node = node.nextElementSibling;
		return node && { title: heading.textContent, text: node.textContent };
	};

	let current = null;
	const show = async (link) => {
		current = link;
		const url = new URL(link.href);
		const data = extract(await load(url.pathname), url.hash);
		if (current !== link || !data) return;
		tip.replaceChildren();
		const title = document.createElement('strong');
		title.textContent = data.title || '';
		const text = document.createElement('p');
		text.textContent = data.text;
		tip.append(title, text);
		tip.hidden = false;
		const box = link.getBoundingClientRect();
		const left = Math.min(Math.max(8, box.left), innerWidth - tip.offsetWidth - 8);
		const below = box.bottom + 8 + tip.offsetHeight < innerHeight;
		tip.style.left = left + scrollX + 'px';
		tip.style.top = (below ? box.bottom + 8 : box.top - tip.offsetHeight - 8) + scrollY + 'px';
	};
	const hide = () => {
		current = null;
		tip.hidden = true;
	};

	const target = (event) => {
		const link = event.target.closest?.('.sl-markdown-content a[href]');
		if (!link || link.origin !== location.origin || link.classList.contains('sl-anchor-link')) return null;
		const url = new URL(link.href);
		return url.pathname === location.pathname && !url.hash ? null : link;
	};
	for (const type of ['mouseover', 'focusin']) document.addEventListener(type, (e) => { const l = target(e); if (l) show(l); });
	for (const type of ['mouseout', 'focusout']) document.addEventListener(type, (e) => { if (target(e)) hide(); });
	addEventListener('scroll', hide, { passive: true });
})();
