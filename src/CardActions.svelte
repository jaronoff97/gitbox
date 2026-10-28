<script lang="ts">
	import Popover from 'gpuix-svelte/components/Popover.svelte';
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import Tooltip from 'gpuix-svelte/components/Tooltip.svelte';
	import { on_window_key, type GpuixEvent } from 'gpuix-svelte';
	import { close as close_icon } from './icons.ts';
	import { number, web_url, type Action, type Notification } from './gh.ts';

	// The actions on cards: the context menu (#2), the bar for a selection (#3), and the dialogs they
	// share. Close and opening many tabs ask first; Comment takes the text. Everything acts on a list:
	// a right click on a selected card acts on the whole selection. Board runs the actions; `onrun`
	// resolves to whether they all worked.
	let {
		target,
		selection,
		progress,
		onclose,
		onrun,
		onclear,
		ondialog
	}: {
		target: { list: Notification[]; x: number; y: number } | null;
		selection: Notification[];
		/** A bulk action under way: "Marking 40 as done", with how many calls are back. */
		progress: { verb: string; done: number; total: number } | null;
		onclose: () => void;
		onrun: (action: Action, list: Notification[], body?: string) => Promise<boolean>;
		onclear: () => void;
		/** Whether a dialog is open, so the board leaves its keys (⌘↩, Escape) to it. */
		ondialog: (open: boolean) => void;
	} = $props();

	/** "Open" past this many tabs asks first. */
	const TABS = 10;

	let confirming = $state<Notification[] | null>(null);
	let opening = $state<Notification[] | null>(null);
	let writing = $state<Notification | null>(null);
	let body = $state('');
	let sending = $state(false);

	/** A PR or issue: those take comments and can be closed. */
	const thread = (n: Notification) => web_url(n.subject.url) !== null;
	const noun = (n: Notification) => (n.subject.type === 'PullRequest' ? 'pull request' : 'issue');
	const where = (n: Notification) => `${n.repository.full_name}${number(n) ? ` #${number(n)}` : ''}`;
	const closable = (list: Notification[]) => list.every((n) => thread(n) && n.state === 'OPEN');
	const reopenable = (list: Notification[]) => list.every((n) => thread(n) && n.state === 'CLOSED');
	/** "2 pull requests and 1 issue". */
	function nouns(list: Notification[]) {
		const prs = list.filter((n) => n.subject.type === 'PullRequest').length;
		const issues = list.length - prs;
		const part = (k: number, word: string) => (k ? `${k} ${word}${k === 1 ? '' : 's'}` : '');
		return [part(prs, 'pull request'), part(issues, 'issue')].filter(Boolean).join(' and ');
	}

	/** Why an action can't run on `list`, or null if it can. */
	function blocked(action: Action, list: Notification[]): string | null {
		if (action === 'read' && !list.some((n) => n.unread)) return 'Every selected notification is read';
		if (action === 'close' && !closable(list)) return 'Only open pull requests and issues can close';
		return null;
	}

	function pick(action: Action, list: Notification[]) {
		onclose();
		if (blocked(action, list)) return;
		if (action === 'close') confirming = list;
		else if (action === 'open' && list.length > TABS) opening = list;
		else if (action === 'comment') {
			writing = list[0];
			body = '';
		} else onrun(action, list);
	}

	function close_as(action: Action) {
		const list = confirming!;
		confirming = null;
		onrun(action, list);
	}

	function open_all() {
		const list = opening!;
		opening = null;
		onrun('open', list);
	}

	async function send() {
		if (!writing || !body.trim() || sending) return;
		sending = true;
		const ok = await onrun('comment', [writing], body);
		sending = false;
		if (ok) writing = null;
	}

	$effect(() => ondialog(confirming !== null || writing !== null || opening !== null));

	// Escape closes a dialog; Enter confirms; ⌘↩ sends a comment.
	$effect(() => {
		if (!confirming && !writing && !opening) return;
		return on_window_key('keydown', (e: GpuixEvent) => {
			if (e.key === 'escape') {
				confirming = null;
				writing = null;
				opening = null;
			} else if (e.key === 'enter' && confirming) close_as('close');
			else if (e.key === 'enter' && opening) open_all();
			else if (e.key === 'enter' && e.modifiers?.cmd && writing) send();
		});
	});
</script>

{#snippet item(action: Action, list: Notification[], title: string, danger = false)}
	<div class="item" class:danger testId="menu-{action}" onclick={() => pick(action, list)}>{title}</div>
{/snippet}

{#snippet bar_button(action: Action, title: string)}
	{@const reason = blocked(action, selection)}
	{#if reason}
		<Tooltip content={reason} side="top">
			{#snippet children(hover)}
				<div class="b off" {...hover} testId="bulk-{action}">{title}</div>
			{/snippet}
		</Tooltip>
	{:else}
		<div class="b" testId="bulk-{action}" tabindex={0} onclick={() => pick(action, selection)}>{title}</div>
	{/if}
{/snippet}

<Popover
	open={target !== null}
	{onclose}
	position={target ? { x: target.x, y: target.y } : null}
	testid="card-menu"
	style="padding: 5px"
>
	<div></div>
	{#snippet content()}
		{#if target}
			{@const list = target.list}
			{@const k = list.length}
			{@const one = list[0]}
			<div class="menu">
				{#if k > 1}<div class="head">{k} selected</div>{/if}
				{@render item('open', list, k === 1 ? 'Open in Browser' : `Open ${k} in Browser`)}
				{@render item('copy', list, k === 1 ? 'Copy Link' : `Copy ${k} Links`)}
				<div class="sep"></div>
				{#if list.some((n) => n.unread)}{@render item('read', list, k === 1 ? 'Mark as Read' : `Mark ${k} as Read`)}{/if}
				{@render item('done', list, k === 1 ? 'Mark as Done' : `Mark ${k} as Done`)}
				{@render item('unsubscribe', list, k === 1 ? 'Unsubscribe' : `Unsubscribe from ${k}`)}
				{#if list.every(thread)}
					<div class="sep"></div>
					{#if k === 1}{@render item('comment', list, 'Comment…')}{/if}
					{#if closable(list)}
						{@render item('close', list, k === 1 ? `Close ${noun(one)}…` : `Close ${k}…`, true)}
					{:else if reopenable(list)}
						{@render item('reopen', list, k === 1 ? `Reopen ${noun(one)}` : `Reopen ${k}`)}
					{/if}
				{/if}
			</div>
		{/if}
	{/snippet}
</Popover>

<!-- Shown while a bulk action runs too: done and unsubscribe take its cards off the board at once. -->
{#if selection.length || progress}
	<Portal>
		<div class="dock">
			<div class="bar" testId="selection-bar">
				{#if progress}
					<div class="count">{`${progress.verb}… ${progress.done}/${progress.total}`}</div>
				{:else}
					<div class="count">{selection.length} selected</div>
					<div class="divider"></div>
					{@render bar_button('read', 'Mark as Read')}
					{@render bar_button('done', 'Mark as Done')}
					{@render bar_button('unsubscribe', 'Unsubscribe')}
					{@render bar_button('close', 'Close…')}
					{@render bar_button('open', 'Open')}
					{@render bar_button('copy', 'Copy Links')}
					<div class="divider"></div>
					<svg class="x" source={close_icon} testId="bulk-clear" onclick={onclear}></svg>
				{/if}
			</div>
		</div>
	</Portal>
{/if}

{#if confirming}
	{@const list = confirming}
	{@const n = list[0]}
	<Portal>
		<div class="scrim" onclick={() => (confirming = null)}>
			<div class="dialog" testId="confirm-dialog" onclick={() => {}}>
				{#if list.length === 1}
					<div class="title">Close this {noun(n)}?</div>
					<div class="sub">{where(n)}</div>
					<div class="subject">{n.subject.title}</div>
				{:else}
					<div class="title">Close {nouns(list)}?</div>
					<div class="sub">{[...new Set(list.map((x) => x.repository.full_name))].join(', ')}</div>
				{/if}
				<div class="buttons">
					<div class="btn" testId="confirm-cancel" tabindex={0} onclick={() => (confirming = null)}>Cancel</div>
					{#if list.every((x) => x.subject.type === 'Issue')}
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

{#if opening}
	<Portal>
		<div class="scrim" onclick={() => (opening = null)}>
			<div class="dialog" testId="open-dialog" onclick={() => {}}>
				<div class="title">Open {opening.length} tabs?</div>
				<div class="sub">Each selected notification opens in your browser.</div>
				<div class="buttons">
					<div class="btn" testId="open-cancel" tabindex={0} onclick={() => (opening = null)}>Cancel</div>
					<div class="btn primary" testId="open-confirm" tabindex={0} onclick={open_all}>Open {opening.length}</div>
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
	.head {
		padding: 4px 10px 6px 10px;
		font-size: 11px;
		font-weight: semibold;
		color: var(--muted);
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
	.dock {
		position: absolute;
		left: 0px;
		bottom: 20px;
		width: 100%;
		display: flex;
		justify-content: center;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px 8px 6px 14px;
		border-radius: 12px;
		border-width: 1px;
		border-color: var(--accent);
		background-color: var(--raised);
		/* The bar sits over the lanes; this keeps a wheel over it from scrolling them. */
		pointer-events: auto;
	}
	.count {
		padding-right: 6px;
		font-size: 13px;
		font-weight: semibold;
		color: var(--ink);
	}
	.divider {
		width: 1px;
		height: 18px;
		margin: 0px 4px;
		background-color: var(--border);
	}
	.b {
		padding: 5px 10px;
		border-radius: 7px;
		font-size: 12px;
		color: var(--ink);
		cursor: pointer;
	}
	.b:hover {
		background-color: var(--tool-hover);
	}
	.b.off {
		opacity: 0.35;
		cursor: default;
	}
	.b:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
	}
	.x {
		width: 14px;
		height: 14px;
		padding: 5px;
		border-radius: 6px;
		color: var(--muted);
		cursor: pointer;
	}
	.x:hover {
		color: var(--ink);
		background-color: var(--tool-hover);
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
