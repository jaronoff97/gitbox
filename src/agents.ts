// Who answers: Apple's on-device model through `fm`, or an agent CLI the user has signed in to,
// Claude Code (`claude -p`) or Codex (`codex exec`). Settings → Models picks one for Chat and one for
// drafting an empty Whiteboard; only the commands found on PATH are offered.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { respond } from './fm.ts';
import { env } from './gh.ts';

export type Agent = 'fm' | 'claude' | 'codex';

/** `label` is the short name Settings → Models shows. */
export const AGENTS: { key: Agent; title: string; label: string; command: string; models: string; where: string }[] = [
	{ key: 'fm', title: 'Apple’s on-device model', label: 'Apple', command: 'fm', models: '', where: 'what you ask stays on this Mac' },
	{ key: 'claude', title: 'Claude Code', label: 'Claude', command: 'claude', models: 'opus, sonnet, haiku', where: 'what you ask goes to Anthropic' },
	{ key: 'codex', title: 'Codex', label: 'Codex', command: 'codex', models: 'a model your Codex account offers', where: 'what you ask goes to OpenAI' }
];

export const agent = (key: Agent) => AGENTS.find((a) => a.key === key)!;

/** The agents whose command is on the PATH gitbox gives its tools. */
export function installed(): Agent[] {
	const dirs = env().PATH.split(':');
	return AGENTS.filter((a) => dirs.some((d) => existsSync(join(d, a.command)))).map((a) => a.key);
}

export type Turn = {
	/** The system prompt: every turn for Claude, the first for fm and Codex (their sessions keep it). */
	instructions: string;
	/** Empty is the agent's default. */
	model?: string;
	/** What continues a conversation: fm's transcript file (always given), or the session id an earlier
	 * reply returned. */
	session?: string;
	/** `chat` answers with no tools; `whiteboard` may read the checkout and write through Whiteboard's
	 * MCP server, which the agent has connected. */
	mode: 'chat' | 'whiteboard';
	cwd?: string;
	/** In a chat: the URL of gitbox's MCP server (src/mcp.ts), whose board tools the agent may use. */
	tools?: string;
	/** The reply so far, as it streams. */
	ontext?: (text: string) => void;
	/** What the agent is doing: a tool it calls. */
	onstep?: (step: string) => void;
};

/** One turn; resolves to the reply and the session that continues it. */
export async function ask(who: Agent, prompt: string, turn: Turn): Promise<{ text: string; session: string }> {
	if (who === 'fm') return { text: await respond(prompt, turn.session!, turn.instructions, (t) => turn.ontext?.(t)), session: turn.session! };
	return who === 'claude' ? claude(prompt, turn) : codex(prompt, turn);
}

/** Runs `command` with `input` on stdin and hands each JSON line of stdout to `onevent`; resolves to
 * why it failed (the end of stderr), or '' when it exits 0. The caller prefers an error event. */
function events(command: string, args: string[], input: string, cwd: string | undefined, onevent: (e: Record<string, any>) => void): Promise<string> {
	return new Promise((resolve, reject) => {
		const child = spawn(command, args, { env: env(), cwd });
		let rest = '';
		let err = '';
		const line = (l: string) => {
			try {
				onevent(JSON.parse(l));
			} catch {
				// Not an event: a warning on stdout.
			}
		};
		child.stdout.on('data', (d) => {
			const lines = (rest + d).split('\n');
			rest = lines.pop()!;
			lines.filter((l) => l.trim()).forEach(line);
		});
		child.stderr.on('data', (d) => (err += d));
		child.on('error', reject);
		child.on('close', (code) => {
			if (rest.trim()) line(rest);
			resolve(code === 0 ? '' : err.trim().split('\n').slice(-3).join(' ') || `${command} exited ${code}`);
		});
		child.stdin.end(input);
	});
}

/** The tools Claude may use on a Whiteboard: Whiteboard's MCP server (as the plugin, or added by
 * hand), reading the checkout and its git history, and the PR through gh. Nothing that writes code. */
const WHITEBOARD_TOOLS = [
	'mcp__plugin_whiteboard_whiteboard',
	'mcp__whiteboard',
	'Read',
	'Grep',
	'Glob',
	'Task',
	'Bash(git diff:*)',
	'Bash(git log:*)',
	'Bash(git show:*)',
	'Bash(gh pr view:*)',
	'Bash(gh pr diff:*)'
];

async function claude(prompt: string, turn: Turn) {
	const args = [
		'-p',
		'--output-format',
		'stream-json',
		'--verbose',
		'--include-partial-messages',
		...(turn.model ? ['--model', turn.model] : []),
		...(turn.session ? ['--resume', turn.session] : []),
		...(turn.mode === 'chat'
			? // A chat: none of the user's hooks or plugins (their settings) or MCP servers, and no built-in
				// tools; only gitbox's board tools. (--safe-mode would also drop CLAUDE.md, but it drops
				// --mcp-config too.)
				// `=` with nothing after it: Bun's spawn drops an empty argument, so `--setting-sources ''`
				// would take the next flag as its value.
				[
					'--setting-sources=',
					'--strict-mcp-config',
					'--tools=',
					'--system-prompt',
					turn.instructions,
					...(turn.tools
						? ['--mcp-config', JSON.stringify({ mcpServers: { gitbox: { type: 'http', url: turn.tools } } }), '--permission-mode', 'dontAsk', '--allowedTools', 'mcp__gitbox']
						: [])
				]
			: ['--permission-mode', 'dontAsk', '--allowedTools', ...WHITEBOARD_TOOLS])
	];
	let session = turn.session ?? '';
	let text = '';
	let error = '';
	const failed = await events('claude', args, prompt, turn.cwd, (e) => {
		if (e.session_id) session = e.session_id;
		const ev = e.event;
		if (e.type === 'stream_event' && ev?.type === 'message_start') text = '';
		// Not `ontext?.((text += …))`: with no ontext, `?.` would skip the assignment too.
		if (e.type === 'stream_event' && ev?.delta?.type === 'text_delta') {
			text += ev.delta.text;
			turn.ontext?.(text);
		}
		if (e.type === 'assistant')
			for (const c of e.message?.content ?? []) if (c.type === 'tool_use') turn.onstep?.(c.name.replace(/^mcp__.+?__/, ''));
		if (e.type === 'result') e.is_error ? (error = e.result || e.subtype) : (text = e.result ?? text);
	});
	if (error || failed) throw new Error(error || failed);
	return { text, session };
}

async function codex(prompt: string, turn: Turn) {
	const options = [
		'--json',
		'--skip-git-repo-check',
		'-c',
		'sandbox_mode="read-only"',
		...(turn.model ? ['-m', turn.model] : []),
		// `codex exec` asks nothing, so it refuses MCP tools that need approval; gitbox's are approved
		// here, as `act` asks the user itself.
		...(turn.tools ? ['-c', `mcp_servers.gitbox.url="${turn.tools}"`, '-c', 'mcp_servers.gitbox.default_tools_approval_mode="approve"'] : [])
	];
	// Codex has no system prompt flag; a new session starts with the instructions.
	const args = turn.session ? ['exec', 'resume', ...options, turn.session, '-'] : ['exec', ...options, '-'];
	let session = turn.session ?? '';
	let text = '';
	let error = '';
	const failed = await events('codex', args, turn.session ? prompt : `${turn.instructions}\n\n${prompt}`, turn.cwd, (e) => {
		if (e.type === 'thread.started') session = e.thread_id;
		const item = e.item ?? {};
		if (e.type === 'item.started' && item.type === 'mcp_tool_call') turn.onstep?.(item.tool);
		if (e.type === 'item.started' && item.type === 'command_execution') turn.onstep?.(item.command);
		if (e.type === 'item.completed' && item.type === 'agent_message') {
			text = item.text;
			turn.ontext?.(text);
		}
		if (e.type === 'turn.failed' || e.type === 'error') error = inner(e.error?.message ?? e.message);
	});
	if ((error || failed) && !text) throw new Error(error || failed);
	return { text, session };
}

/** Codex wraps the API's error JSON in its message; this digs out the sentence. */
function inner(message: string): string {
	try {
		return JSON.parse(message).error?.message ?? message;
	} catch {
		return message;
	}
}
