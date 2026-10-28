// Automations: "when a notification matches these conditions, then do these steps", saved in
// automations.json beside state.json and checked every minute against the newest unread notifications.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { untrack } from 'svelte';
import { field, matches, type Filter } from './filters.ts';
import * as gh from './gh.ts';
import type { Notification } from './gh.ts';
import { track } from './jobs.svelte.ts';
import { automations_file, dir, load, save } from './store.ts';

export type Step = 'approve' | 'read' | 'done' | 'unsubscribe';

export type Automation = {
	id: string;
	name: string;
	enabled: boolean;
	/** The conditions, as board filters: any value of one field, and every field. */
	when: Filter[];
	/** In this order; a step that fails stops the rest. */
	then: Step[];
	/** ISO time it was made. It acts only on notifications updated after, so saving one doesn't approve
	 * a backlog. */
	created: string;
};

/** One automation acting on one thread. */
export type Run = { automation: string; thread: string; title: string; url: string | null; at: string; error?: string };

export const STEPS: { key: Step; title: string; run: (n: Notification) => Promise<unknown> }[] = [
	{ key: 'approve', title: 'Approve the pull request', run: gh.approve },
	{ key: 'read', title: 'Mark as read', run: gh.mark_read },
	{ key: 'done', title: 'Mark as done', run: gh.mark_done },
	{ key: 'unsubscribe', title: 'Unsubscribe', run: gh.unsubscribe }
];

export const automations = $state<{ list: Automation[]; log: Run[] }>({ list: [], log: [] });

/** Reads the file and the log; App calls it on mount, so a test can point XDG_CONFIG_HOME first. */
export function init() {
	try {
		automations.list = JSON.parse(readFileSync(automations_file(), 'utf8'));
	} catch {
		automations.list = [];
	}
	automations.log = load().automation_log ?? [];
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
	const steps = a.then.map((s) => STEPS.find((x) => x.key === s)!.title.toLowerCase());
	return `When ${fields.join(' and ') || 'anything arrives'}, ${steps.join(', then ') || 'do nothing'}.`;
}

/** Runs each enabled automation on the notifications it matches, once per thread.
 * ponytail: once per thread, so new commits on an approved PR don't approve it again; key the log on
 * `updated_at` too if a re-run on new activity is ever wanted. */
export async function apply(items: Notification[]) {
	const todo = automations.list
		.filter((a) => a.enabled && a.when.length && a.then.length)
		.flatMap((a) => items.filter((n) => n.updated_at >= a.created && matches(n, a.when)).map((n) => ({ a, n })))
		.filter(({ a, n }) => !automations.log.some((r) => r.automation === a.id && r.thread === n.id));
	// A check with nothing to do stays out of the progress popup, as it runs every minute.
	if (!todo.length) return;
	await track('Running automations', async (job) => {
		job.total = todo.length;
		for (const { a, n } of todo) {
			job.detail = `${a.name || 'Untitled'}: ${n.subject.title}`;
			const run: Run = { automation: a.id, thread: n.id, title: n.subject.title, url: gh.web_url(n.subject.url), at: new Date().toISOString() };
			try {
				for (const step of a.then) await STEPS.find((s) => s.key === step)!.run(n);
			} catch (e) {
				run.error = (e as Error).message;
			}
			automations.log = [run, ...automations.log].slice(0, 200);
			save({ automation_log: $state.snapshot(automations.log) });
			job.done++;
		}
	});
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
