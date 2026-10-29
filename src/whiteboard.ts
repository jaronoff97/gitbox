// Whiteboard (dev.fast's review canvas, #22): a PR opens there on a board pinned to its head and base.
// Everything goes through the `whiteboard` CLI, which the Whiteboard app installs in ~/.local/bin;
// `session_create` fetches the PR into a local checkout and returns the PR's board if it has one.
import { execFile } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';
import { once, unavailable } from './fm.ts';
import { env, gh, web_url, type Notification } from './gh.ts';
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

/** One file of a PR's diff: its path, its size, the diff text, and the head lines of its largest
 * hunk, for a code peek. */
type FileDiff = { path: string; deleted: boolean; added: number; removed: number; text: string; peek?: string };

/** Lock files and binaries: listed, not summarized. */
const SKIP = /(^|\/)(package-lock\.json|bun\.lockb?|yarn\.lock|pnpm-lock\.yaml|Cargo\.lock|go\.sum|poetry\.lock|Gemfile\.lock)$/;
/** The files the model summarizes, largest first; the rest are listed. Each takes it about 2 s. */
const MAX_FILES = 15;
/** Diff text per file: about 2,400 tokens, well inside the model's context with the instructions. */
const MAX_DIFF = 7000;
/** A code peek's lines at most. */
const MAX_PEEK = 30;

/** Splits a unified diff (`gh pr diff`) into its files. */
export function files_of(diff: string): FileDiff[] {
	return diff
		.split(/^(?=diff --git )/m)
		.filter((text) => text.startsWith('diff --git '))
		.map((text) => {
			const deleted = /^\+\+\+ \/dev\/null/m.test(text);
			const path = (deleted ? text.match(/^--- a\/(.+)$/m) : text.match(/^\+\+\+ b\/(.+)$/m))?.[1] ?? text.match(/^diff --git a\/\S+ b\/(.+)$/m)?.[1] ?? '';
			const lines = text.split('\n');
			const added = lines.filter((l) => l.startsWith('+') && !l.startsWith('+++')).length;
			const removed = lines.filter((l) => l.startsWith('-') && !l.startsWith('---')).length;
			// The hunk with the most head lines: `@@ -a,b +start,count @@`.
			const hunks = [...text.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)].map((m) => ({ start: +m[1], count: m[2] === undefined ? 1 : +m[2] }));
			const big = hunks.sort((a, b) => b.count - a.count)[0];
			const peek = !deleted && big?.count ? `head/${path}#L${big.start}-L${big.start + Math.min(big.count, MAX_PEEK) - 1}` : undefined;
			return { path, deleted, added, removed, text, peek };
		});
}

const NOTE = "Apple's on-device model drafted this on your Mac from the pull request's description and diff. It can be wrong: check it against the code.";

/** Writes a first draft of PR `url`'s board with Apple's on-device model: what and why, each file's
 * change with a peek at its largest hunk, and what to check. The structure goes down first and fills
 * in as the model answers, so a reader in Whiteboard watches it arrive.
 * ponytail: a 3B model with a 4k context reads one file at a time; diagrams (sequence, flow,
 * call_stack_diff) need an agent that reads the code. */
export function draft(sessionId: string, url: string, title: string, onstart: () => void): Promise<string> {
	return track('Writing the Whiteboard', async (job) => {
		job.detail = 'Reading the diff';
		const [diff, view] = await Promise.all([gh('pr', 'diff', url), gh('pr', 'view', url, '--json', 'title,body')]);
		const pr = JSON.parse(view) as { title: string; body: string };
		const all = files_of(diff);
		const big = new Set(all.filter((f) => !SKIP.test(f.path) && !/^Binary files /m.test(f.text)).sort((a, b) => b.added + b.removed - (a.added + a.removed)).slice(0, MAX_FILES));
		const summarized = all.filter((f) => big.has(f));
		const listed = all.filter((f) => !big.has(f));

		const { activityId } = await api<{ activityId: string }>('session_activity_begin', { sessionId, focus: { description: 'Drafting with Apple’s on-device model' } }, onstart);
		const edit = (e: object) => api<{ targetId: string; children?: { id: string }[] }>('session_edit', { sessionId, activityId, edit: e }, onstart);
		const insert = (content: object, parentId?: string) => edit({ type: 'insert', content, ...(parentId && { parentId }) });
		try {
			await insert({ type: 'callout', tone: 'info', title: 'A first draft', children: [{ type: 'markdown', markdown: NOTE }] });
			const what = await insert({ type: 'section', title: 'What and why', children: [{ type: 'markdown', markdown: '_Reading the diff…_' }] });
			const changes = await insert({ type: 'section', title: 'Changes', children: [] });

			job.total = summarized.length;
			const notes: string[] = [];
			for (const f of summarized) {
				job.detail = f.path;
				const summary = await once(
					`Pull request: ${pr.title}\nFile: ${f.path} (+${f.added} -${f.removed})\n\n${f.text.slice(0, MAX_DIFF)}`,
					'You explain one file of a pull request to a code reviewer. In one or two short sentences, say what changed in this file and why. Use plain words. No preamble, no lists.'
				).catch((e: Error) => `_The model could not read this file: ${e.message}_`);
				notes.push(`- ${f.path}: ${summary}`);
				const name = f.peek ? `[${f.path}](whiteboard:source/${f.peek})` : f.path;
				await insert({ type: 'markdown', markdown: `**${name}** · +${f.added} −${f.removed}\n\n${summary}` }, changes.targetId);
				// A range Whiteboard can't quote (a file it can't read) costs the peek, not the draft.
				if (f.peek) await insert({ type: 'code_peek', source: f.peek }, changes.targetId).catch(() => {});
				job.done++;
			}
			if (listed.length)
				await insert({ type: 'markdown', markdown: `Also changed: ${listed.map((f) => `\`${f.path}\` (+${f.added} −${f.removed})`).join(', ')}.` }, changes.targetId);

			job.detail = 'What and why';
			const facts = `Title: ${pr.title}\n\nDescription:\n${(pr.body || '(none)').slice(0, 2000)}\n\nWhat each file changes:\n${notes.join('\n')}`;
			const summary = await once(
				facts,
				'You write the opening of a code review: what the pull request changes and why, in at most three short sentences of plain prose. Use only the facts given. No preamble, no lists.'
			);
			await edit({ type: 'update', targetId: what.children![0].id, changes: { markdown: summary } });

			job.detail = 'What to check';
			const checks = await once(
				facts,
				'From these notes on a pull request, list two to four specific things a reviewer should check in the code. Reply only with Markdown bullets that start with "- ". Use only the facts given.'
			);
			// The model forgets the bullets, or quotes each one with its bullet inside: `- "- Check …"`.
			const bullets = checks
				.split('\n')
				.map((l) => l.trim().replace(/^[-*]\s+/, '').replace(/^"(.*)"$/, '$1').replace(/^[-*]\s+/, ''))
				.filter(Boolean)
				.map((l) => `- ${l}`)
				.join('\n');
			await insert({ type: 'section', title: 'What to check', children: [{ type: 'markdown', markdown: bullets }] });
		} finally {
			await api('session_activity_end', { sessionId, activityId }, onstart).catch(() => {});
		}
		return `Drafted the Whiteboard for ${title}`;
	});
}

/** Opens PR `n` in Whiteboard, making its board if it has none. Resolves to what to tell the user, and,
 * for an empty board, the draft that Apple's on-device model is writing into it. */
export async function open_pr(n: Notification): Promise<{ text: string; drafting?: Promise<string> }> {
	const opened = await open_board(n);
	if (!opened.empty) return { text: opened.text };
	const why = await unavailable();
	if (why) return { text: `${opened.text}. It stays empty: Apple’s on-device model isn’t available (${why}).` };
	return { text: opened.text, drafting: draft(opened.sessionId, opened.url, n.subject.title, () => {}) };
}

/** Opens PR `n`'s board; reports whether it has no content yet. */
function open_board(n: Notification): Promise<{ text: string; sessionId: string; url: string; empty: boolean }> {
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
		// `session_get --json` gives the blocks by position; an empty board gives {}.
		const blocks = board.created ? {} : JSON.parse(await cli('api', 'session_get', JSON.stringify({ sessionId: board.sessionId }), '--json'));
		return {
			text: board.created ? 'Made a Whiteboard for the pull request' : 'Opened the pull request’s Whiteboard',
			sessionId: board.sessionId,
			url,
			empty: Object.keys(blocks).length === 0
		};
	});
}
