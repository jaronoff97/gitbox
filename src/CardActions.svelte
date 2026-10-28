<script lang="ts">
	import Popover from 'gpuix-svelte/components/Popover.svelte';
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import { on_window_key, type GpuixEvent } from 'gpuix-svelte';
	import { number, web_url, type Action, type Notification } from './gh.ts';

	// A card's context menu (#2), and the two dialogs its actions need: Close asks first, and Comment
	// takes the text. Board runs the actions; `onrun` resolves to whether one worked.
	let {
		target,
		onclose,
		onrun
	}: {
		target: { n: Notification; x: number; y: number } | null;
		onclose: () => void;
		onrun: (action: Action, n: Notification, body?: string) => Promise<boolean>;
	} = $props();

	let confirming = $state<Notification | null>(null);
	let writing = $state<Notification | null>(null);
	let body = $state('');
	let sending = $state(false);

	/** A PR or issue: those take comments and can be closed. */
	const thread = (n: Notification) => web_url(n.subject.url) !== null;
	const noun = (n: Notification) => (n.subject.type === 'PullRequest' ? 'pull request' : 'issue');
	const where = (n: Notification) => `${n.repository.full_name}${number(n) ? ` #${number(n)}` : ''}`;

	function pick(action: Action, n: Notification) {
		onclose();
		if (action === 'close') confirming = n;
		else if (action === 'comment') {
			writing = n;
			body = '';
		} else onrun(action, n);
	}

	function close_as(action: Action) {
		const n = confirming!;
		confirming = null;
		onrun(action, n);
	}

	async function send() {
		if (!writing || !body.trim() || sending) return;
		sending = true;
		const ok = await onrun('comment', writing, body);
		sending = false;
		if (ok) writing = null;
	}

	// Escape closes a dialog; Enter confirms a close; ⌘↩ sends a comment.
	$effect(() => {
		if (!confirming && !writing) return;
		return on_window_key('keydown', (e: GpuixEvent) => {
			if (e.key === 'escape') {
				confirming = null;
				writing = null;
			} else if (e.key === 'enter' && confirming) close_as('close');
			else if (e.key === 'enter' && e.modifiers?.cmd && writing) send();
		});
	});
</script>

{#snippet item(action: Action, n: Notification, title: string, danger = false)}
	<div class="item" class:danger testId="menu-{action}" onclick={() => pick(action, n)}>{title}</div>
{/snippet}

<Popover
	open={target !== null}
	onclose={onclose}
	position={target ? { x: target.x, y: target.y } : null}
	testid="card-menu"
	style="padding: 5px"
>
	<div></div>
	{#snippet content()}
		{#if target}
			{@const n = target.n}
			<div class="menu">
				{@render item('open', n, 'Open in Browser')}
				{@render item('copy', n, 'Copy Link')}
				<div class="sep"></div>
				{#if n.unread}{@render item('read', n, 'Mark as Read')}{/if}
				{@render item('done', n, 'Mark as Done')}
				{@render item('unsubscribe', n, 'Unsubscribe')}
				{#if thread(n)}
					<div class="sep"></div>
					{@render item('comment', n, 'Comment…')}
					{#if n.state === 'OPEN'}
						{@render item('close', n, `Close ${noun(n)}…`, true)}
					{:else if n.state === 'CLOSED'}
						{@render item('reopen', n, `Reopen ${noun(n)}`)}
					{/if}
				{/if}
			</div>
		{/if}
	{/snippet}
</Popover>

{#if confirming}
	{@const n = confirming}
	<Portal>
		<div class="scrim" onclick={() => (confirming = null)}>
			<div class="dialog" testId="confirm-dialog" onclick={() => {}}>
				<div class="title">Close this {noun(n)}?</div>
				<div class="sub">{where(n)}</div>
				<div class="subject">{n.subject.title}</div>
				<div class="buttons">
					<div class="btn" testId="confirm-cancel" tabindex={0} onclick={() => (confirming = null)}>Cancel</div>
					{#if n.subject.type === 'Issue'}
						<div class="btn" testId="confirm-not-planned" tabindex={0} onclick={() => close_as('close-not-planned')}>
							Close as not planned
						</div>
					{/if}
					<div class="btn danger" testId="confirm-close" tabindex={0} onclick={() => close_as('close')}>Close</div>
				</div>
			</div>
		</div>
	</Portal>
{/if}

{#if writing}
	{@const n = writing}
	<Portal>
		<div class="scrim" onclick={() => !sending && (writing = null)}>
			<div class="dialog wide" testId="comment-dialog" onclick={() => {}}>
				<div class="title">Comment on {where(n)}</div>
				<div class="subject">{n.subject.title}</div>
				<textarea
					class="field"
					value={body}
					placeholder="Leave a comment (Markdown)"
					testId="comment-body"
					autofocus
					onchange={(e: GpuixEvent) => (body = e.value ?? '')}
				></textarea>
				<div class="buttons">
					<div class="hint">⌘↩ to send</div>
					<div class="btn" testId="comment-cancel" tabindex={0} onclick={() => (writing = null)}>Cancel</div>
					<div class="btn primary" class:off={!body.trim() || sending} testId="comment-send" tabindex={0} onclick={send}>
						{sending ? 'Sending…' : 'Comment'}
					</div>
				</div>
			</div>
		</div>
	</Portal>
{/if}

<style>
	.menu {
		display: flex;
		flex-direction: column;
		width: 210px;
		/* The menu hangs over the lanes; this keeps a wheel over it from scrolling them too. */
		pointer-events: auto;
	}
	.item {
		padding: 5px 10px;
		border-radius: 5px;
		font-size: 13px;
		color: var(--ink);
		cursor: pointer;
	}
	.item:hover {
		background-color: var(--accent);
		color: var(--bg);
	}
	.item.danger {
		color: var(--fail);
	}
	.item.danger:hover {
		background-color: var(--fail);
		color: var(--bg);
	}
	.sep {
		height: 1px;
		margin: 4px 6px;
		background-color: var(--border);
	}
	.scrim {
		position: absolute;
		top: 0px;
		left: 0px;
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--scrim);
		/* GPUI scrolls every scroll container under the pointer; this hides the board from the wheel. */
		pointer-events: auto;
	}
	.dialog {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 420px;
		padding: 20px 22px;
		border-radius: 14px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--surface);
	}
	.dialog.wide {
		width: 560px;
	}
	.title {
		font-size: 15px;
		font-weight: bold;
		color: var(--ink);
	}
	.sub {
		font-size: 12px;
		color: var(--muted);
	}
	.subject {
		font-size: 13px;
		color: var(--muted);
		line-clamp: 2;
	}
	.field {
		height: 160px;
		margin-top: 8px;
		padding: 10px;
		border-radius: 8px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--bg);
		font-size: 13px;
		line-height: 19px;
		color: var(--ink);
	}
	.buttons {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
		margin-top: 12px;
	}
	.hint {
		flex-grow: 1;
		font-size: 11px;
		color: var(--muted);
	}
	.btn {
		padding: 6px 12px;
		border-radius: 7px;
		font-size: 13px;
		background-color: var(--border);
		color: var(--ink);
		cursor: pointer;
	}
	.btn:hover {
		background-color: var(--thumb);
	}
	.btn.danger {
		background-color: var(--fail);
		color: var(--bg);
		font-weight: semibold;
	}
	.btn.primary {
		background-color: var(--ok);
		color: var(--bg);
		font-weight: semibold;
	}
	.btn.off {
		opacity: 0.4;
		cursor: default;
	}
	.btn:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
	}
</style>
