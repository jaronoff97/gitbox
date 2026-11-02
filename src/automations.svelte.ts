// Automations: "when a notification matches these conditions, then do these steps", saved in
// automations.json beside state.json and checked every minute against the newest unread notifications.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { untrack } from 'svelte';
import { field, matches, words, type Field, type Filter } from './filters.ts';
import * as gh from './gh.ts';
import type { Notification } from './gh.ts';
import { track } from './jobs.svelte.ts';
import { notify } from './notify.ts';
import { automations_file, dir, load, save } from './store.ts';

export type Step = 'approve' | 'read' | 'done' | 'unsubscribe' | 'notify';

export type Automation = {
	id: string;
	name: string;
	enabled: boolean;
	/** The conditions, as board filters: any value of one field, and every field. */
	when: Filter[];
	/** In this order; a step that fails stops the rest. */
	then: Step[];
	/** What a notification step stacks its notifications by in Notification Center, any field a
	 * condition can use (the repository when unset). */
	group_by?: Field;
	/** ISO time it was made. It acts only on notifications updated after, so saving one doesn't approve
	 * a backlog. */
	created: string;
};

/** One automation acting on one thread, at its `updated_at` then. */
export type Run = { automation: string; thread: string; title: string; url: string | null; at: string; updated_at?: string; error?: string };

/** What `n` stacks under when grouped by `key`: the field's first value ("no label" when it has none). */
export function group_of(n: Notification, key: Field) {
	const f = field(key);
	return `${key}:${f.values(n)[0] ?? `no ${f.title.toLowerCase()}`}`;
}

/** A notification for `n` (#35): "octo/repo #4", the reason, and the title; a click opens its page.
 * It stacks with the others of the same `group_by` value. */
async function notify_of(n: Notification, a: Automation) {
	const num = gh.number(n);
	const reason = words(n.reason);
	await notify({
		id: `${n.id}:${n.updated_at}`,
		title: `${n.repository.full_name}${num && gh.web_url(n.subject.url) ? ` #${num}` : ''}`,
		subtitle: reason.charAt(0).toUpperCase() + reason.slice(1),
		body: n.subject.title,
		group: group_of(n, a.group_by ?? 'repo'),
		url: await gh.link(n)
	});
}

export const STEPS: { key: Step; title: string; run: (n: Notification, a: Automation) => Promise<unknown> }[] = [
	{ key: 'approve', title: 'Approve the pull request', run: gh.approve },
	{ key: 'read', title: 'Mark as read', run: gh.mark_read },
	{ key: 'done', title: 'Mark as done', run: gh.mark_done },
	{ key: 'unsubscribe', title: 'Unsubscribe', run: gh.unsubscribe },
	// Last: a failed approval or a refused permission doesn't stop the other's step.
	{ key: 'notify', title: 'Send a macOS notification', run: notify_of }
];

/** A notification alone acts on everything without harm, so it needs no condition; and it rings again
 * when a thread has new activity. */
export const notify_only = (a: Pick<Automation, 'then'>) => a.then.length > 0 && a.then.every((s) => s === 'notify');

/** The ready-made automation, added once (#35): off with a switch, or edited, like any other. */
const NOTIFY_ALL = (): Automation => ({
	id: 'notify-all',
	name: 'Notify me of every notification',
	enabled: true,
	when: [],
	then: ['notify'],
	created: new Date().toISOString()
});

/** At most this many notifications in one check, then one that counts the rest. */
const BURST = 5;

export const automations = $state<{ list: Automation[]; log: Run[] }>({ list: [], log: [] });

/** Reads the file and the log; App calls it on mount, so a test can point XDG_CONFIG_HOME first. */
export function init() {
	try {
		automations.list = JSON.parse(readFileSync(automations_file(), 'utf8'));
	} catch {
		automations.list = [];
	}
	automations.log = load().automation_log ?? [];
	if (!load().notify_seeded) {
		if (!automations.list.some((a) => a.id === 'notify-all')) put(NOTIFY_ALL());
		save({ notify_seeded: true });
	}
}

function write() {
	mkdirSync(dir(), { recursive: true });
	writeFileSync(automations_file(), JSON.stringify($state.snapshot(automations.list), null, '\t'));
}

/** Adds `a`, or replaces the automation with its id. */
export function put(a: Automation) {
	const at = automations.list.findIndex((b) => b.id === a.id);
	automations.list = at < 0 ? [...automations.list, a] : automations.list.with(at, a);
	write();
}

export function remove(id: string) {
	automations.list = automations.list.filter((a) => a.id !== id);
	write();
}

/** "When reason is review requested and author is adam or bob, approve the pull request." */
export function describe(a: Automation) {
	const fields = [...Map.groupBy(a.when, (f) => f.field)].map(([key, list]) => `${field(key).title.toLowerCase()} is ${list.map((f) => f.value).join(' or ')}`);
	// Only the first letter: "send a macOS notification".
	const steps = a.then.map((s) => {
		const title = STEPS.find((x) => x.key === s)!.title.replace(/^./, (c) => c.toLowerCase());
		return s === 'notify' && a.group_by && a.group_by !== 'repo' ? `${title}, grouped by ${field(a.group_by).title.toLowerCase()}` : title;
	});
	return `When ${fields.join(' and ') || 'anything arrives'}, ${steps.join(', then ') || 'do nothing'}.`;
}

/** Runs each enabled automation on the notifications it matches: once per thread, so new commits on
 * an approved PR don't approve it again; a notify-only automation again on new activity. */
export async function apply(items: Notification[]) {
	const todo = automations.list
		.filter((a) => a.enabled && a.then.length && (a.when.length || notify_only(a)))
		.flatMap((a) => items.filter((n) => n.updated_at >= a.created && matches(n, a.when)).map((n) => ({ a, n })))
		.filter(
			({ a, n }) =>
				!automations.log.some((r) => r.automation === a.id && r.thread === n.id && (!notify_only(a) || r.updated_at === n.updated_at))
		);
	// A check with nothing to do stays out of the progress popup, as it runs every minute.
	if (!todo.length) return;
	let rung = 0;
	let muted = 0;
	await track('Running automations', async (job) => {
		job.total = todo.length;
		for (const { a, n } of todo) {
			job.detail = `${a.name || 'Untitled'}: ${n.subject.title}`;
			const run: Run = {
				automation: a.id,
				thread: n.id,
				title: n.subject.title,
				url: gh.web_url(n.subject.url),
				at: new Date().toISOString(),
				updated_at: n.updated_at
			};
			try {
				for (const step of a.then) {
					// A burst (a first check after a while away) rings BURST times, then once for the rest.
					if (step === 'notify' && rung >= BURST) {
						muted++;
						continue;
					}
					await STEPS.find((s) => s.key === step)!.run(n, a);
					if (step === 'notify') rung++;
				}
			} catch (e) {
				run.error = (e as Error).message;
			}
			automations.log = [run, ...automations.log].slice(0, 200);
			save({ automation_log: $state.snapshot(automations.log) });
			job.done++;
		}
	});
	if (muted)
		await notify({
			id: `more:${Date.now()}`,
			title: 'Gitbox',
			subtitle: '',
			body: `And ${muted} more notification${muted === 1 ? '' : 's'}`,
			group: 'gitbox',
			url: 'https://github.com/notifications'
		}).catch(() => {});
}

let running: Promise<void> | null = null;

/** Fetches the newest unread notifications and applies the automations; while one check runs, this
 * returns it rather than starting another. */
export function check(): Promise<void> {
	if (!running && automations.list.some((a) => a.enabled))
		running = gh
			.notifications(1)
			.then(apply)
			// ponytail: a failed fetch waits for the next minute; the board shows gh's errors.
			.catch(() => {})
			.finally(() => (running = null));
	return running ?? Promise.resolve();
}

/** Checks now and every minute; returns what stops it (for an `$effect`, which must not depend on the
 * list it reads, or each edit would restart it). */
export function watch() {
	untrack(check);
	const timer = setInterval(check, 60_000);
	return () => clearInterval(timer);
}
