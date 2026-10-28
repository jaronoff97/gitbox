<script module lang="ts">
	import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
	import { join } from 'node:path';
	import { dir } from './store.ts';

	type Message = { role: 'user' | 'model'; text: string; error?: boolean };
	type Conversation = { id: string; title: string; updated: string; messages: Message[] };

	// Each conversation is two files in ~/.config/gitbox/chats: <id>.json (what the tab shows) and
	// <id>.fm.json (fm's transcript, which a later turn resumes, after a restart too).
	const chats = () => join(dir(), 'chats');
	const file = (id: string) => join(chats(), `${id}.json`);
	const transcript = (id: string) => join(chats(), `${id}.fm.json`);

	// Module state, so the chat outlives a switch to another tab (which unmounts this one). `id` is the
	// open conversation; '' is a new one, which the first message makes.
	const chat = $state({ list: [] as Conversation[], id: '', draft: '', busy: false, loaded: false });

	/** Reads the saved conversations, newest first, on the first mount (so a test can point
	 * XDG_CONFIG_HOME first). A file that doesn't parse is left out. */
	function load() {
		if (chat.loaded) return;
		chat.loaded = true;
		const names = existsSync(chats()) ? readdirSync(chats()).filter((f) => f.endsWith('.json') && !f.endsWith('.fm.json')) : [];
		chat.list = names
			.flatMap((f): Conversation[] => {
				try {
					return [JSON.parse(readFileSync(join(chats(), f), 'utf8'))];
				} catch {
					return [];
				}
			})
			.sort((a, b) => b.updated.localeCompare(a.updated));
	}

	function write(c: Conversation) {
		mkdirSync(chats(), { recursive: true });
		writeFileSync(file(c.id), JSON.stringify($state.snapshot(c), null, '\t'));
	}
</script>

<script lang="ts">
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import type { GpuixEvent } from 'gpuix-svelte';
	import { respond, unavailable } from './fm.ts';
	import { words } from './filters.ts';
	import * as gh from './gh.ts';
	import { ago } from './ago.ts';
	import { close, plus } from './icons.ts';

	load();
	const current = $derived(chat.list.find((c) => c.id === chat.id));

	/** Null once fm answers that the model is ready; until then, or when it isn't, why. */
	let problem = $state<string | null>('Checking for Apple’s on-device model…');
	unavailable().then((p) => (problem = p));

	/** The first turn's instructions: who the user is and their newest unread notifications, so a
	 * question about them has an answer. The model's context is about 4,000 tokens, hence 20.
	 * ponytail: the model only talks. To let it act, have it answer in a schema (fm's --schema) that
	 * names a gh command, and run that after the user confirms. */
	async function instructions() {
		const [me, list] = await Promise.all([gh.viewer().catch(() => null), gh.notifications(1).catch(() => [])]);
		const lines = list
			.slice(0, 20)
			.map(
				(n) =>
					`- ${words(n.reason)}: ${n.repository.full_name}, "${n.subject.title}" (${words(n.subject.type)}` +
					`${n.state ? `, ${n.draft ? 'draft' : n.state.toLowerCase()}` : ''}${n.author ? `, by ${n.author}` : ''})`
			);
		return [
			'You are the assistant in Gitbox, a Mac app for GitHub notifications. Answer briefly.',
			me && `The user is ${me.login} on GitHub.`,
			lines.length ? `Their newest unread notifications, newest first:\n${lines.join('\n')}` : 'They have no unread notifications.',
			'You cannot act on GitHub yourself. To act, say which gh command would do it.'
		]
			.filter(Boolean)
			.join('\n');
	}

	async function send() {
		const prompt = chat.draft.trim();
		if (!prompt || chat.busy) return;
		chat.draft = '';
		chat.busy = true;
		if (!current) {
			chat.list.unshift({ id: crypto.randomUUID(), title: prompt.split('\n')[0].slice(0, 80), updated: new Date().toISOString(), messages: [] });
			chat.id = chat.list[0].id;
		}
		const c = current!;
		c.messages.push({ role: 'user', text: prompt });
		c.messages.push({ role: 'model', text: '' });
		const reply = c.messages[c.messages.length - 1];
		try {
			// A transcript on disk carries the instructions; a turn that failed before writing one starts over.
			const start = existsSync(transcript(c.id)) ? '' : await instructions();
			mkdirSync(chats(), { recursive: true });
			await respond(prompt, transcript(c.id), start, (text) => (reply.text = text));
		} catch (e) {
			reply.text = (e as Error).message;
			reply.error = true;
		} finally {
			c.updated = new Date().toISOString();
			chat.list = [c, ...chat.list.filter((d) => d !== c)];
			write(c);
			chat.busy = false;
		}
	}

	/** Opens conversation `id` ('' for a new one); not while a reply streams into the open one. */
	const open = (id: string) => !chat.busy && (chat.id = id);

	function remove(id: string) {
		if (chat.busy) return;
		rmSync(file(id), { force: true });
		rmSync(transcript(id), { force: true });
		chat.list = chat.list.filter((c) => c.id !== id);
		if (chat.id === id) chat.id = '';
	}

	const pressed = (e: GpuixEvent) => e.key === 'space' || e.key === 'enter';
</script>

<div class="page">
	<div class="header">
		<div class="titles">
			<div class="title">Chat</div>
			<div class="subtitle">Apple’s on-device model: what you ask stays on this Mac</div>
		</div>
		<div class="grow"></div>
		{#if current}
			<div class="btn" hitbox="self" testId="chat-new" tabindex={0} onclick={() => open('')} onkeydown={(e: GpuixEvent) => pressed(e) && open('')}>
				<svg class="icon" source={plus}></svg>
				<div>New chat</div>
			</div>
		{/if}
	</div>

	<div class="body">
		<div class="side">
			<Scroller pad="10px" gap={2}>
				{#each chat.list as c (c.id)}
					<div class="item" class:on={c.id === chat.id} hitbox="self" testId="chat-{c.id}" onclick={() => open(c.id)}>
						<div class="text">
							<div class="name">{c.title}</div>
							<div class="hint">{ago(c.updated)}</div>
						</div>
						<svg class="x" source={close} testId="chat-delete-{c.id}" onclick={() => remove(c.id)}></svg>
					</div>
				{:else}
					<div class="hint pad">Past chats show here.</div>
				{/each}
			</Scroller>
		</div>
		<div class="main">
			{#if problem}
				<div class="empty">
					<div class="label">Chat needs macOS 27 or later, with Apple Intelligence on.</div>
					<div class="hint" testId="chat-problem">{problem}</div>
				</div>
			{:else}
				<Scroller pad="20px 24px" gap={14} follow testid="chat-log">
					{#each current?.messages ?? [] as m, i (i)}
						{#if m.role === 'user'}
							<div class="mine">
								<div class="bubble">{m.text}</div>
							</div>
						{:else if m.error}
							<div class="hint fail">{m.text}</div>
						{:else if m.text}
							<markdown class="reply" testId="chat-reply" source={m.text} onlinkclick={(e: GpuixEvent) => e.value && gh.open_url(e.value)}></markdown>
						{/if}
					{:else}
						<div class="hint">Ask about your notifications: what needs your review, what changed today, which PRs are bob’s.</div>
					{/each}
					{#if chat.busy}<div class="hint" testId="chat-busy">Thinking…</div>{/if}
				</Scroller>
				<div class="composer">
					<textarea
						class="input"
						value={chat.draft}
						placeholder="Ask something (↩ sends, ⇧↩ adds a line)"
						testId="chat-input"
						autofocus
						onchange={(e: GpuixEvent) => (chat.draft = e.value ?? '')}
						onsubmit={send}
					></textarea>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		font-size: var(--text-md, 13px);
		color: var(--ink);
	}
	.header {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 52px;
		flex-shrink: 0;
		padding: 0px 14px 0px 16px;
		border-bottom-width: 1px;
		border-color: var(--separator);
		background-color: var(--toolbar);
		user-select: none;
	}
	.titles {
		display: flex;
		flex-direction: column;
	}
	.title {
		font-size: var(--text-title, 13px);
		font-weight: bold;
	}
	.subtitle {
		font-size: var(--text-xs, 11px);
		color: var(--muted);
	}
	.grow {
		flex-grow: 1;
	}
	.body {
		display: flex;
		flex-grow: 1;
		flex-basis: 0;
		min-height: 0;
	}
	.side {
		display: flex;
		flex-direction: column;
		width: 240px;
		flex-shrink: 0;
		border-right-width: 1px;
		border-color: var(--separator);
		background-color: var(--lane);
	}
	.main {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		flex-basis: 0;
		min-width: 0;
	}
	.item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 10px;
		border-radius: 6px;
		cursor: pointer;
	}
	.item:hover {
		background-color: var(--tool-hover);
	}
	.item.on {
		background-color: var(--border);
	}
	.text {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		flex-basis: 0;
		min-width: 0;
		gap: 2px;
	}
	.name {
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
	}
	.pad {
		padding: 4px;
	}
	.x {
		width: 12px;
		height: 12px;
		flex-shrink: 0;
		color: var(--muted);
		cursor: pointer;
	}
	.x:hover {
		color: var(--fail);
	}
	.empty {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		align-items: center;
		justify-content: center;
		gap: 6px;
	}
	.label {
		color: var(--ink);
	}
	.hint {
		font-size: var(--text-sm, 12px);
		color: var(--muted);
	}
	.hint.fail {
		color: var(--fail);
	}
	.mine {
		display: flex;
		justify-content: end;
	}
	.bubble {
		max-width: 70%;
		padding: 8px 12px;
		border-radius: 12px;
		background-color: var(--border);
		line-height: 19px;
	}
	.reply {
		max-width: 85%;
		line-height: 19px;
		color: var(--ink);
	}
	.composer {
		display: flex;
		flex-shrink: 0;
		padding: 12px 24px 20px 24px;
	}
	.input {
		flex-grow: 1;
		min-height: 40px;
		max-height: 160px;
		padding: 10px 12px;
		border-radius: 10px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--surface);
		color: var(--ink);
		font-size: var(--text-md, 13px);
	}
	.icon {
		width: 14px;
		height: 14px;
	}
	.btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 6px;
		font-size: var(--text-sm, 12px);
		background-color: var(--border);
		color: var(--ink);
		cursor: pointer;
	}
	.btn:hover {
		background-color: var(--thumb);
	}
	.btn:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
	}
</style>
