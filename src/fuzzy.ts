// The ⌘K palette's match (#6): the query's characters must appear in the text in order. Each one
// scores more at the start of a word, and more again right after the one before it; text that
// matches late, or is long, scores a little less. No match is null.

const WORD_EDGE = /[\s/\-_:.#@()[\]]/;

export function score(query: string, text: string): number | null {
	const q = query.trim().toLowerCase();
	const t = text.toLowerCase();
	if (!q) return 0;
	let total = 0;
	let from = 0;
	let run = 0;
	for (const ch of q) {
		if (ch === ' ') continue;
		const at = t.indexOf(ch, from);
		if (at < 0) return null;
		const word_start = at === 0 || WORD_EDGE.test(t[at - 1]);
		run = at === from && from > 0 ? run + 1 : 0;
		total += 1 + (word_start ? 8 : 0) + run * 4 - Math.min(at - from, 10) * 0.5;
		from = at + 1;
	}
	return total - t.length * 0.02;
}
