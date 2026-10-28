// Every GitHub call goes through the local `gh` CLI, so the app holds no token of its own.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { settings } from './settings.svelte.ts';

const exec = promisify(execFile);

// An app started from Finder or the Dock gets launchd's PATH (/usr/bin:/bin:/usr/sbin:/sbin), which
// misses where Homebrew and Linuxbrew put gh. Appended, so a gh earlier on a real PATH still wins.
const EXTRA_PATH = ['/opt/homebrew/bin', '/usr/local/bin', '/home/linuxbrew/.linuxbrew/bin'];
const env = () => ({
	...process.env,
	PATH: [process.env.PATH, ...EXTRA_PATH].filter(Boolean).join(':'),
	// Settings → Advanced (#8): a GitHub Enterprise host.
	...(settings.gh_host.trim() && { GH_HOST: settings.gh_host.trim() })
});
/** gh itself: Settings → Advanced's path, else the one on PATH. */
const GH = () => settings.gh_path.trim() || 'gh';

export type Notification = {
	id: string;
	reason: string;
	unread: boolean;
	updated_at: string;
	subject: { title: string; type: string; url: string | null };
	repository: { full_name: string; html_url: string; owner: { login: string; avatar_url: string } };
	// Looked up with the page for a PR or issue; undefined for other subjects.
	/** OPEN, CLOSED or MERGED. */
	state?: string;
	draft?: boolean;
	author?: string;
	labels?: { name: string; color: string }[];
	/** PRs only: how many reviews, and the outcome of the latest review from each reviewer. */
	reviews?: number;
	review?: 'approved' | 'changes requested' | 'commented' | 'none';
};

// reviewDecision would say the same as latestReviews, but GitHub works it out from branch rules,
// which made a page of 50 take 4 s more; latestReviews costs about 0.2 s.
const FRAGMENT = `
	... on PullRequest { state isDraft author { login } labels(first: 20) { nodes { name color } }
		reviews { totalCount } latestReviews(first: 20) { nodes { state } } }
	... on Issue { state author { login } labels(first: 20) { nodes { name color } } }`;

type Subject = {
	state: string;
	isDraft?: boolean;
	author: { login: string } | null;
	labels: { nodes: { name: string; color: string }[] };
	reviews?: { totalCount: number };
	latestReviews?: { nodes: { state: string }[] };
};

/** Copies what GraphQL found for a subject onto its notification. */
function enrich(n: Notification, s: Subject | null | undefined) {
	if (!s) return;
	n.state = s.state;
	n.draft = s.isDraft;
	n.author = s.author?.login;
	n.labels = s.labels.nodes;
	if (s.reviews) {
		const states = s.latestReviews?.nodes.map((r) => r.state) ?? [];
		n.reviews = s.reviews.totalCount;
		n.review = states.includes('CHANGES_REQUESTED')
			? 'changes requested'
			: states.includes('APPROVED')
				? 'approved'
				: n.reviews > 0
					? 'commented'
					: 'none';
	}
}

export type Check = { label: string; hint: string; run: () => Promise<string> };

/** Runs `gh` and returns stdout; rejects with stderr (or the spawn error) on failure. */
export async function gh(...args: string[]): Promise<string> {
	try {
		const { stdout } = await exec(GH(), args, { maxBuffer: 64 * 1024 * 1024, env: env() });
		return stdout.trim();
	} catch (e) {
		const err = e as { code?: string; stderr?: string; stdout?: string; message: string };
		if (err.code === 'ENOENT')
			throw new Error(settings.gh_path.trim() ? `gh was not found at ${GH()}` : `gh was not found on PATH or in ${EXTRA_PATH.join(', ')}`);
		// GraphQL exits 1 when some fields fail, yet still prints the data it got.
		throw Object.assign(new Error(err.stderr?.trim() || err.message), { stdout: err.stdout });
	}
}

/** The signed-in user. */
export async function viewer(): Promise<{ login: string; avatar_url: string }> {
	return JSON.parse(await gh('api', 'user', '--jq', '{login, avatar_url}'));
}

/** The onboarding steps, in order; each resolves to a short detail line or rejects. */
export const checks: Check[] = [
	{
		label: 'GitHub CLI installed',
		hint: 'Install it from https://cli.github.com (macOS: brew install gh)',
		run: async () => (await gh('--version')).split('\n')[0]
	},
	{
		label: 'Signed in to GitHub',
		hint: 'Run `gh auth login` in a terminal',
		run: async () => `as ${(await viewer()).login}`
	},
	{
		label: 'Notifications readable',
		hint: 'Run `gh auth refresh -s notifications` in a terminal',
		run: async () => (await gh('api', 'notifications?per_page=1'), 'access ok')
	}
];

export const PER_PAGE = 50; // the API maximum

/** The github.com page of a notification's PR or issue, or null for other subjects. */
export function web_url(api: string | null): string | null {
	if (!api || !/\/(pulls|issues)\/\d+$/.test(api)) return null;
	return api.replace('api.github.com/repos/', 'github.com/').replace('/pulls/', '/pull/');
}

/**
 * One page (from 1) of the signed-in user's notifications, newest first, enriched: unread
 * only unless `all`, and only threads they take part in if `participating`.
 * GraphQL has no notifications, so the list is REST; its subjects carry no node id for `nodes()`,
 * so the rest comes from one aliased `resource(url:)` query per page, a direct lookup by URL.
 */
export async function notifications(
	page: number,
	{ all = false, participating = false }: { all?: boolean; participating?: boolean } = {}
): Promise<Notification[]> {
	const query = `per_page=${PER_PAGE}&page=${page}${all ? '&all=true' : ''}${participating ? '&participating=true' : ''}`;
	const list: Notification[] = JSON.parse(await gh('api', `notifications?${query}`));
	// One GraphQL call for the whole page: an alias per PR or issue.
	const fields = list.map((n, i) => {
		const url = web_url(n.subject.url);
		return url ? `a${i}: resource(url: ${JSON.stringify(url)}) { ${FRAGMENT} }` : '';
	});
	if (fields.some(Boolean)) {
		let out: string;
		try {
			out = await gh('api', 'graphql', '-f', `query={ ${fields.join('\n')} }`);
		} catch (e) {
			// Some unreadable subjects still leave data for the rest; no data at all is a real failure.
			out = (e as { stdout?: string }).stdout ?? '';
			if (!out) throw e;
		}
		const data = JSON.parse(out).data || {};
		list.forEach((n, i) => enrich(n, data[`a${i}`]));
	}
	return list;
}

// Each repository's security advisories, fetched once, on the first advisory card opened there.
const advisories = new Map<string, Promise<{ summary: string; html_url: string }[]>>();

/** The page to open for a notification, as close to its subject as the API allows. */
export async function link(n: Notification): Promise<string> {
	const repo = n.repository.html_url;
	const web = web_url(n.subject.url);
	if (web) return web;
	try {
		// The notification has no URL for an advisory, but its title is the advisory's summary. Only
		// maintainers see draft and triage advisories; others get the repository's advisory list.
		if (n.subject.type === 'RepositoryAdvisory') {
			const name = n.repository.full_name;
			if (!advisories.has(name)) {
				const all = gh('api', '--paginate', '--slurp', `repos/${name}/security-advisories?per_page=100`);
				advisories.set(name, all.then((out) => JSON.parse(out).flat(), () => []));
			}
			const found = (await advisories.get(name)!).find((a) => a.summary === n.subject.title);
			return found?.html_url ?? `${repo}/security/advisories`;
		}
		// Releases, commits and the like: their API object knows its page.
		if (n.subject.url) return (await gh('api', n.subject.url, '--jq', '.html_url')) || repo;
	} catch {
		return repo;
	}
	if (n.subject.type === 'CheckSuite') return `${repo}/actions`;
	if (n.subject.type === 'Discussion') return `${repo}/discussions`;
	return repo;
}

/** Opens `url` in the default browser. */
export function open_url(url: string) {
	const [cmd, args]: [string, string[]] =
		process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]];
	spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
}

/** Runs `cmd` with `input` on stdin; rejects with stderr on a non-zero exit. */
function pipe(cmd: string, args: string[], input: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(cmd, args, { env: env() });
		let out = '';
		let err = '';
		child.stdout.on('data', (d) => (out += d));
		child.stderr.on('data', (d) => (err += d));
		child.on('error', reject);
		child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(err.trim() || `${cmd} exited ${code}`))));
		child.stdin.end(input);
	});
}

/** What a card's context menu can do. */
export type Action = 'open' | 'copy' | 'read' | 'done' | 'unsubscribe' | 'close' | 'close-not-planned' | 'reopen' | 'comment';

/** The PR's or issue's number, from its URL. */
export const number = (n: Notification) => n.subject.url?.match(/\/(\d+)$/)?.[1] ?? '';

// Card actions (#2). Thread calls need the notifications or repo scope; close and comment need
// write access to the repository.

export const mark_read = (n: Notification) => gh('api', '-X', 'PATCH', `notifications/threads/${n.id}`);

/** GitHub's "Done": the thread leaves the inbox. */
export const mark_done = (n: Notification) => gh('api', '-X', 'DELETE', `notifications/threads/${n.id}`);

/** Mutes the thread until a new mention, then marks it done. */
export async function unsubscribe(n: Notification) {
	await gh('api', '-X', 'PUT', `notifications/threads/${n.id}/subscription`, '-F', 'ignored=true');
	await mark_done(n);
}

/** `pr` or `issue`, for the gh subcommands that take a PR's or an issue's URL. */
const kind = (n: Notification) => (n.subject.type === 'PullRequest' ? 'pr' : 'issue');

/** Closes or reopens a PR or issue; an issue closes as completed unless `reason` says otherwise. */
export function set_state(n: Notification, state: 'closed' | 'open', reason?: 'completed' | 'not planned') {
	const url = web_url(n.subject.url);
	if (!url) return Promise.reject(new Error('Only a pull request or an issue can be closed'));
	if (state === 'open') return gh(kind(n), 'reopen', url);
	return gh(kind(n), 'close', url, ...(reason && kind(n) === 'issue' ? ['--reason', reason] : []));
}

/** Comments on a PR or issue; the body goes through stdin, so no text can break the command. */
export function comment(n: Notification, body: string) {
	const url = web_url(n.subject.url);
	if (!url) return Promise.reject(new Error('Only a pull request or an issue takes comments'));
	return pipe(GH(), [kind(n), 'comment', url, '--body-file', '-'], body);
}

/** Puts `text` on the clipboard: gpuix-svelte has no clipboard call, so this is the system's tool.
 * ponytail: Linux gets Wayland's wl-copy only; add xclip when someone runs it on X11. */
export function copy(text: string) {
	const [cmd, args]: [string, string[]] =
		process.platform === 'darwin' ? ['pbcopy', []] : process.platform === 'win32' ? ['clip', []] : ['wl-copy', []];
	return pipe(cmd, args, text);
}

/** Runs `fn` on each item, `limit` at a time, and returns the ones that failed with their errors. */
export async function pool<T>(items: T[], limit: number, fn: (item: T) => Promise<unknown>) {
	const failed: { item: T; error: Error }[] = [];
	let next = 0;
	const worker = async () => {
		while (next < items.length) {
			const item = items[next++];
			await fn(item).catch((error: Error) => failed.push({ item, error }));
		}
	};
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return failed;
}
