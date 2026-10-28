// Every GitHub call goes through the local `gh` CLI, so the app holds no token of its own.
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export type Notification = {
	id: string;
	reason: string;
	unread: boolean;
	updated_at: string;
	subject: { title: string; type: string; url: string | null };
	repository: { full_name: string };
	/** OPEN, CLOSED or MERGED for a PR or issue, looked up with the page; undefined for others. */
	state?: string;
};

export type Check = { label: string; hint: string; run: () => Promise<string> };

/** Runs `gh` and returns stdout; rejects with stderr (or the spawn error) on failure. */
export async function gh(...args: string[]): Promise<string> {
	try {
		const { stdout } = await exec('gh', args, { maxBuffer: 64 * 1024 * 1024 });
		return stdout.trim();
	} catch (e) {
		const err = e as { code?: string; stderr?: string; stdout?: string; message: string };
		if (err.code === 'ENOENT') throw new Error('gh was not found on PATH');
		// GraphQL exits 1 when some fields fail, yet still prints the data it got.
		throw Object.assign(new Error(err.stderr?.trim() || err.message), { stdout: err.stdout });
	}
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
		run: async () => `as ${await gh('api', 'user', '--jq', '.login')}`
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
 * One page (from 1) of the signed-in user's unread notifications, newest first, with `state` set.
 * GraphQL has no notifications, so the list is REST; its subjects carry no node id for `nodes()`,
 * so the states come from one aliased `resource(url:)` query per page, a direct lookup by URL.
 */
export async function notifications(page: number): Promise<Notification[]> {
	const list: Notification[] = JSON.parse(await gh('api', `notifications?per_page=${PER_PAGE}&page=${page}`));
	// One GraphQL call for the whole page: an alias per PR or issue.
	const fields = list.map((n, i) => {
		const url = web_url(n.subject.url);
		return url ? `a${i}: resource(url: ${JSON.stringify(url)}) { ... on PullRequest { state } ... on Issue { state } }` : '';
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
		list.forEach((n, i) => (n.state = data[`a${i}`]?.state));
	}
	return list;
}
