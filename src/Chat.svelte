<script module lang="ts">
	import { existsSync } from 'node:fs';
	import { tmpdir } from 'node:os';
	import { join } from 'node:path';

	type Message = { role: 'user' | 'model'; text: string; error?: boolean };

	// Module state, so the conversation outlives a switch to another tab (which unmounts this one).
	const chat = $state({ messages: [] as Message[], draft: '', busy: false, transcript: '' });
	const fresh = () => join(tmpdir(), `gitbox-chat-${crypto.randomUUID()}.json`);
	chat.transcript = fresh();
</script>

<script lang="ts">
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import type { GpuixEvent } from 'gpuix-svelte';
	import { respond, unavailable } from './fm.ts';
	import { words } from './filters.ts';
	import * as gh from './gh.ts';
	import { plus } from './icons.ts';

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
		chat.messages.push({ role: 'user', text: prompt });
		chat.messages.push({ role: 'model', text: '' });
		const reply = chat.messages[chat.messages.length - 1];
		try {
			// A transcript on disk carries the instructions; a turn that failed before writing one starts over.
			const start = existsSync(chat.transcript) ? '' : await instructions();
			await respond(prompt, chat.transcript, start, (text) => (reply.text = text));
		} catch (e) {
			reply.text = (e as Error).message;
			reply.error = true;
		} finally {
			chat.busy = false;
		}
	}

	function restart() {
		if (chat.busy) return;
		chat.messages = [];
		chat.transcript = fresh();
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
		{#if chat.messages.length}
			<div class="btn" hitbox="self" testId="chat-new" tabindex={0} onclick={restart} onkeydown={(e: GpuixEvent) => pressed(e) && restart()}>
				<svg class="icon" source={plus}></svg>
				<div>New chat</div>
			</div>
		{/if}
	</div>

	{#if problem}
		<div class="empty">
			<div class="label">Chat needs macOS 27 or later, with Apple Intelligence on.</div>
			<div class="hint" testId="chat-problem">{problem}</div>
		</div>
	{:else}
		<Scroller pad="20px 24px" gap={14} follow testid="chat-log">
			{#each chat.messages as m, i (i)}
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
