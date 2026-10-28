<script lang="ts">
	import type { GpuixEvent } from 'gpuix-svelte';
	import { words } from './filters.ts';
	import { link, open_url, type Notification } from './gh.ts';
	import { subject_icon } from './icons.ts';

	let { n }: { n: Notification } = $props();

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
	testId="card-{n.id}"
	hitbox="self"
	tabindex={0}
	onclick={open}
	onkeydown={(e: GpuixEvent) => e.key === 'enter' && open()}
>
	<div class="top">
		{#if n.repository.owner?.avatar_url}
			<img class="avatar" src={n.repository.owner.avatar_url} alt={n.repository.owner.login} />
		{/if}
		<div class="repo">{n.repository.full_name}</div>
		<div class="when">{ago(n.updated_at)}</div>
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
		gap: 8px;
		width: 100%;
		padding: 12px;
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
	.card.read {
		opacity: 0.55;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
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
		font-size: 11px;
	}
	.title {
		font-size: 13px;
		line-height: 18px;
		color: var(--ink);
		line-clamp: 3;
	}
	.foot {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 11px;
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
		font-size: 11px;
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
		font-size: 11px;
		color: var(--muted);
	}
	.reason {
		flex-shrink: 0;
		padding: 1px 6px;
		border-radius: 4px;
		background-color: var(--border);
	}
</style>
