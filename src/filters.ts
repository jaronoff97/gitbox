// Board filters: each picks one value of one field. Filters on the same field match any of their
// values (repo a OR repo b); filters on different fields must all match (repo a AND label bug).
import type { Notification } from './gh.ts';

export type Field = 'repo' | 'type' | 'state' | 'label' | 'reviews' | 'review' | 'reason' | 'author';
export type Filter = { field: Field; value: string };

/** "PullRequest" or "review_requested" as words: "pull request", "review requested". */
export const words = (s: string) =>
	s
		.replaceAll('_', ' ')
		.replace(/([a-z])([A-Z])/g, '$1 $2')
		.toLowerCase();

/** Each field's title and the values a notification has for it (none leaves it out of that field). */
export const FIELDS: { key: Field; title: string; values: (n: Notification) => string[] }[] = [
	{ key: 'repo', title: 'Repository', values: (n) => [n.repository.full_name] },
	{ key: 'type', title: 'Type', values: (n) => [words(n.subject.type)] },
	{
		key: 'state',
		title: 'State',
		values: (n) => (n.state ? [n.draft && n.state === 'OPEN' ? 'draft' : n.state.toLowerCase()] : [])
	},
	{ key: 'label', title: 'Label', values: (n) => n.labels?.map((l) => l.name) ?? [] },
	{
		key: 'reviews',
		title: 'Reviews',
		values: (n) => (n.reviews == null ? [] : [n.reviews >= 3 ? '3+' : String(n.reviews)])
	},
	{ key: 'review', title: 'Review status', values: (n) => (n.review ? [n.review] : []) },
	{ key: 'reason', title: 'Reason', values: (n) => [words(n.reason)] },
	{ key: 'author', title: 'Author', values: (n) => (n.author ? [n.author] : []) }
];

export const field = (key: Field) => FIELDS.find((f) => f.key === key)!;

export function matches(n: Notification, filters: Filter[]): boolean {
	for (const [key, picked] of Map.groupBy(filters, (f) => f.field)) {
		const values = field(key).values(n);
		if (!picked.some((f) => values.includes(f.value))) return false;
	}
	return true;
}

/** The values of `key` in `items`, most common first, with their counts. */
export function options(items: Notification[], key: Field): { value: string; count: number }[] {
	const counts = new Map<string, number>();
	for (const n of items) for (const v of field(key).values(n)) counts.set(v, (counts.get(v) ?? 0) + 1);
	return [...counts]
		.map(([value, count]) => ({ value, count }))
		.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export const same = (a: Filter, b: Filter) => a.field === b.field && a.value === b.value;

/** `filters` with `f` added, or removed if it is there. */
export const toggled = (filters: Filter[], f: Filter) =>
	filters.some((g) => same(f, g)) ? filters.filter((g) => !same(f, g)) : [...filters, f];

/** A label's colour (hex, no #), from any loaded notification that has it. */
export const label_color = (items: Notification[], name: string) =>
	items.flatMap((n) => n.labels ?? []).find((l) => l.name === name)?.color ?? '7f849c';
