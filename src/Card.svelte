<script lang="ts">
	import type { GpuixEvent, ShadowNode } from 'gpuix-svelte';
	import { words } from './filters.ts';
	import { link, open_url, type Notification } from './gh.ts';
	import { card_nodes } from './card_nodes.ts';
	import { subject_icon } from './icons.ts';

	/** `onmenu` opens the context menu at window coordinates (#2); `onselect` reports ⌘- and ⇧-clicks (#3). */
	let {
		n,
		selected,
		focused,
		onmenu,
		onselect,
		onpoint,
		onhover
	}: {
		n: Notification;
		selected: boolean;
		/** The board's keyboard focus (#5) is on this card. */
		focused: boolean;
		onmenu: (x: number, y: number) => void;
		onselect: (how: 'toggle' | 'range') => void;
		/** Any click: the keyboard focus moves here. */
		onpoint: () => void;
		/** The pointer came onto this card: the card, not its lane, gets the hover, as it paints over it. */
		onhover: () => void;
	} = $props();

	/** A plain click opens the card; ⌘ toggles it in the selection, ⇧ selects up to it. */
	function click(e: GpuixEvent) {
		onpoint();
		if (e.modifiers?.cmd) onselect('toggle');
		else if (e.modifiers?.shift) onselect('range');
		else open();
	}


	let subject = $derived(subject_icon(n));

	/** "now", "5m", "3h", "2d", then a date. */
	function ago(iso: string) {
		const s = (Date.now() - Date.parse(iso)) / 1000;
		if (s < 60) return 'now';
		if (s < 3600) return `${Math.floor(s / 60)}m`;
		if (s < 86400) return `${Math.floor(s / 3600)}h`;
		if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
		return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}

	const open = () => link(n).then(open_url);
	const REVIEW_TONE = { approved: 'ok', 'changes requested': 'fail', commented: 'muted', none: 'muted' };
</script>

<div
	class="card"
	class:read={!n.unread}
	class:selected
	class:focused
	testId="card-{n.id}"
	hitbox="self"
	tabindex={0}
	onclick={click}
	onauxclick={(e: GpuixEvent) => e.isRightClick && (onpoint(), onmenu(e.x ?? 0, e.y ?? 0))}
	onfocus={onpoint}
	onmouseenter={onhover}
	{@attach (node: ShadowNode) => {
		card_nodes.set(n.id, node);
		return () => card_nodes.get(n.id) === node && card_nodes.delete(n.id);
	}}
>
	<div class="top">
		{#if n.repository.owner?.avatar_url}
			<img class="avatar" src={n.repository.owner.avatar_url} alt={n.repository.owner.login} />
		{/if}
		<div class="repo">{n.repository.full_name}</div>
		<div class="when">{ago(n.updated_at)}</div>
		{#if selected}<div class="tick">✓</div>{/if}
	</div>
	<div class="title">{n.subject.title}</div>
	{#if n.labels?.length}
		<div class="labels">
			{#each n.labels.slice(0, 4) as l (l.name)}
				<div class="label">
					<div class="dot" style="background-color: #{l.color}"></div>
					<div class="label-name">{l.name}</div>
				</div>
			{/each}
			{#if n.labels.length > 4}<div class="more">+{n.labels.length - 4}</div>{/if}
		</div>
	{/if}
	<div class="foot">
		<svg class="icon" source={subject.icon} style="color: var(--{subject.tone})"></svg>
		<div class="type">{words(n.subject.type)}{n.draft && n.state === 'OPEN' ? ' · draft' : ''}</div>
		{#if n.review && n.review !== 'none'}
			<div class="review" style="color: var(--{REVIEW_TONE[n.review]})">{n.review}</div>
		{/if}
		<div class="reason">{words(n.reason)}</div>
	</div>
</div>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: var(--card-gap, 8px);
		width: 100%;
		padding: var(--card-pad, 12px);
		border-radius: 10px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--surface);
		cursor: pointer;
	}
	.card:hover {
		border-color: var(--thumb);
		background-color: var(--raised);
	}
	.card:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
	}
	.card.focused {
		outline-width: 2px;
		outline-color: var(--accent);
	}
	.card.selected {
		border-color: var(--accent);
		background-color: var(--raised);
	}
	.tick {
		width: 16px;
		height: 16px;
		border-radius: 8px;
		background-color: var(--accent);
		color: var(--bg);
		font-size: 10px;
		font-weight: bold;
		text-align: center;
		line-height: 16px;
	}
	.card.read {
		opacity: 0.55;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--text-sm, 12px);
		color: var(--muted);
	}
	.avatar {
		width: 16px;
		height: 16px;
		border-radius: 4px;
	}
	.repo {
		flex-grow: 1;
		min-width: 0;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}
	.when {
		font-size: var(--text-xs, 11px);
	}
	.title {
		font-size: var(--text-md, 13px);
		line-height: var(--line-md, 18px);
		color: var(--ink);
		line-clamp: 3;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: var(--text-xs, 11px);
		color: var(--muted);
	}
	.icon {
		width: 14px;
		height: 14px;
	}
	.type {
		flex-grow: 1;
		min-width: 0;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}
	.review {
		flex-shrink: 0;
	}
	.labels {
		display: flex;
		gap: 4px;
		overflow: hidden;
	}
	.label {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 1px 6px;
		border-radius: 9px;
		border-width: 1px;
		border-color: var(--border);
		font-size: var(--text-xs, 11px);
		color: var(--muted);
	}
	.label-name {
		max-width: 120px;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}
	.dot {
		width: 6px;
		height: 6px;
		border-radius: 3px;
	}
	.more {
		font-size: var(--text-xs, 11px);
		color: var(--muted);
	}
	.reason {
		flex-shrink: 0;
		padding: 1px 6px;
		border-radius: 4px;
		background-color: var(--border);
	}
</style>
