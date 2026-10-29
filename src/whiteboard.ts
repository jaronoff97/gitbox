// Whiteboard (dev.fast's review canvas, #22): a PR opens there on a board pinned to its head and base.
// Everything goes through the `whiteboard` CLI, which the Whiteboard app installs in ~/.local/bin;
// `session_create` fetches the PR into a local checkout and returns the PR's board if it has one.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { env, web_url, type Notification } from './gh.ts';
import { track } from './jobs.svelte.ts';
import { settings } from './settings.svelte.ts';
import { load, save } from './store.ts';

const exec = promisify(execFile);

/** Runs the whiteboard CLI; rejects with what it printed. */
async function cli(...args: string[]): Promise<string> {
	try {
		return (await exec('whiteboard', args, { env: env(), maxBuffer: 16 * 1024 * 1024 })).stdout.trim();
	} catch (e) {
		const err = e as { code?: string; stderr?: string; stdout?: string; message: string };
		if (err.code === 'ENOENT') throw new Error('Whiteboard was not found. Install it from https://dev.fast/install and open it once.');
		throw new Error((err.stderr || err.stdout || err.message).trim());
	}
}

/** Calls one of Whiteboard's authoring tools; starts Whiteboard first if it isn't running. */
async function api<T>(tool: string, input: object, onstart: () => void): Promise<T> {
	const call = async () => JSON.parse(await cli('api', tool, JSON.stringify(input))) as T;
	try {
		return await call();
	} catch (e) {
		if (!/is not running/.test((e as Error).message)) throw e;
		onstart();
		// Waits until Desktop is ready (Whiteboard gives it 90 s).
		await cli('app', 'launch', '--json');
		return call();
	}
}

/** The GitHub repositories (`owner/repo`, lower case) that a checkout's remotes point at. */
async function remotes(path: string): Promise<string[]> {
	try {
		const { stdout } = await exec('git', ['-C', path, 'remote', '-v'], { env: env() });
		// https://github.com/owner/repo.git and git@github.com:owner/repo.git alike: the last two parts.
		return stdout
			.split('\n')
			.map((line) => line.split(/\s+/)[1] ?? '')
			.filter(Boolean)
			.map((url) => url.replace(/\.git$/, '').split(/[/:]/).slice(-2).join('/').toLowerCase());
	} catch {
		return [];
	}
}

/** Settings → Advanced → Code folders, with ~ expanded. */
export const code_dirs = () =>
	settings.code_dirs
		.split(',')
		.map((d) => d.trim().replace(/^~(?=$|\/)/, homedir()))
		.filter(Boolean);

/** The folders one and two levels under the code folders that hold a repository, those named like
 * `name` first. ponytail: two levels covers ~/Code/repo and ~/Code/org/repo; deeper trees need a
 * folder of their own in the setting. */
function candidates(name: string): string[] {
	const subdirs = (dir: string) => {
		try {
			return readdirSync(dir, { withFileTypes: true })
				.filter((d) => d.isDirectory() && !d.name.startsWith('.'))
				.map((d) => join(dir, d.name));
		} catch {
			return [];
		}
	};
	const found = code_dirs()
		.flatMap((dir) => subdirs(dir).flatMap((d) => [d, ...subdirs(d)]))
		.filter((d) => existsSync(join(d, '.git')));
	return [...found.filter((d) => basename(d).toLowerCase() === name), ...found.filter((d) => basename(d).toLowerCase() !== name)];
}

type Board = { sessionId: string; repositoryPath?: string; project?: { name?: string } };

/** A local checkout of `repo` (`owner/repo`): the one used last time, one Whiteboard knows, or one
 * under the code folders. The answer is remembered in state.json. */
async function checkout(repo: string, onstart: () => void): Promise<string | null> {
	const key = repo.toLowerCase();
	const known = load().repo_paths ?? {};
	const boards = await api<Board[]>('session_list', {}, onstart);
	const paths = [
		known[key],
		...boards.filter((b) => b.project?.name?.toLowerCase() === key).map((b) => b.repositoryPath),
		...candidates(key.split('/')[1])
	].filter((p): p is string => Boolean(p));
	for (const path of new Set(paths)) {
		if (!(await remotes(path)).includes(key)) continue;
		if (known[key] !== path) save({ repo_paths: { ...known, [key]: path } });
		return path;
	}
	return null;
}

/** Opens PR `n` in Whiteboard, making its board if it has none; resolves to what to tell the user. */
export function open_pr(n: Notification): Promise<string> {
	const url = web_url(n.subject.url);
	if (!url || n.subject.type !== 'PullRequest') return Promise.reject(new Error('Only a pull request opens in Whiteboard'));
	const repo = n.repository.full_name;
	return track('Opening in Whiteboard', async (job) => {
		const onstart = () => (job.detail = 'Starting Whiteboard');
		job.detail = `Finding ${repo}`;
		const path = await checkout(repo, onstart);
		if (!path)
			throw new Error(`No checkout of ${repo} in ${code_dirs().join(', ') || 'the code folders'}. Clone it there, or add its folder in Settings → Advanced.`);
		job.detail = `Fetching ${repo}#${url.split('/').pop()}`;
		const board = await api<Board & { created: boolean; opened?: boolean }>(
			'session_create',
			{ target: { kind: 'pullRequest', repositoryPath: path, pullRequest: url } },
			onstart
		);
		// A new board opens itself when Desktop runs; one that existed may not.
		if (!board.opened) await api('session_open', { sessionId: board.sessionId }, onstart);
		return board.created ? 'Made a Whiteboard for the pull request' : 'Opened the pull request’s Whiteboard';
	});
}
