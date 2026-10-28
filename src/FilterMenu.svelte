<script lang="ts">
	import Popover from 'gpuix-svelte/components/Popover.svelte';
	import Tooltip from 'gpuix-svelte/components/Tooltip.svelte';
	import { FIELDS, field, label_color, options, same, toggled, type Field, type Filter } from './filters.ts';
	import type { Notification } from './gh.ts';
	import { filter as filter_icon, left, right } from './icons.ts';

	let {
		items,
		filters,
		onchange
	}: {
		/** The loaded notifications, which the menu offers values from. */
		items: Notification[];
		filters: Filter[];
		onchange: (filters: Filter[]) => void;
	} = $props();

	let open = $state(false);
	let picking = $state<Field | null>(null);
	let query = $state('');

	let values = $derived(
		picking ? options(items, picking).filter((o) => o.value.toLowerCase().includes(query.trim().toLowerCase())) : []
	);

	const is_on = (f: Filter) => filters.some((g) => same(f, g));

	function pick(key: Field | null) {
		picking = key;
		query = '';
	}
</script>

<Popover {open} onclose={() => (open = false)} align="end" testid="filter-menu" style="padding: 6px">
	<Tooltip content="Filter" side="bottom">
		{#snippet children(hover)}
			<div
				class="tool"
				class:on={filters.length > 0}
				{...hover}
				hitbox="self"
				testId="add-filter"
				tabindex={0}
				onclick={() => ((open = !open), pick(null))}
			>
				<svg class="icon" source={filter_icon}></svg>
				{#if filters.length}<div class="count">{filters.length}</div>{/if}
			</div>
		{/snippet}
	</Tooltip>
	{#snippet content()}
		<div class="menu">
			{#if picking === null}
				{#each FIELDS as f (f.key)}
					<div class="item" testId="field-{f.key}" onclick={() => pick(f.key)}>
						<div class="name">{f.title}</div>
						<div class="n">{options(items, f.key).length}</div>
						<svg class="go" source={right}></svg>
					</div>
				{/each}
			{:else}
				<div class="back" testId="filter-back" onclick={() => pick(null)}>
					<svg class="go" source={left}></svg>
					<div>{field(picking).title}</div>
				</div>
				<input class="search" value={query} placeholder="Search…" testId="filter-search" onchange={(e) => (query = e.value ?? '')} />
				<div class="values">
					{#each values as o (o.value)}
						{@const f = { field: picking, value: o.value }}
						<div class="item" class:picked={is_on(f)} testId="value-{o.value}" onclick={() => onchange(toggled(filters, f))}>
							<div class="check">{is_on(f) ? '✓' : ''}</div>
							{#if picking === 'label'}<div class="dot" style="background-color: #{label_color(items, o.value)}"></div>{/if}
							<div class="name">{o.value}</div>
							<div class="n">{o.count}</div>
						</div>
					{:else}
						<div class="empty">Nothing in the loaded notifications</div>
					{/each}
				</div>
			{/if}
		</div>
	{/snippet}
</Popover>

<style>
	.tool {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 28px;
		padding: 0px 7px;
		border-radius: 6px;
		color: var(--muted);
		cursor: pointer;
	}
	.tool:hover {
		color: var(--ink);
		background-color: var(--tool-hover);
	}
	.tool.on {
		color: var(--accent);
	}
	.tool:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
	}
	.icon {
		width: 15px;
		height: 15px;
	}
	.count {
		font-size: 11px;
		font-weight: semibold;
	}
	.menu {
		display: flex;
		flex-direction: column;
		width: 300px;
		/* The menu hangs over the lanes; this keeps a wheel over it from scrolling them too. */
		pointer-events: auto;
	}
	.values {
		display: flex;
		flex-direction: column;
		max-height: 360px;
		padding-right: 6px;
		overflow-y: scroll;
		scrollbar-color: var(--thumb);
	}
	.item,
	.back {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 6px;
		font-size: 13px;
		color: var(--ink);
		cursor: pointer;
	}
	.item:hover,
	.back:hover {
		background-color: var(--border);
	}
	.item.picked {
		color: var(--accent);
	}
	.back {
		font-weight: semibold;
	}
	.check {
		width: 12px;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 4px;
	}
	.name {
		flex-grow: 1;
		min-width: 0;
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}
	.n {
		font-size: 12px;
		color: var(--muted);
	}
	.go {
		width: 14px;
		height: 14px;
		color: var(--muted);
	}
	.search {
		margin: 4px 0px 6px 0px;
		padding: 6px 8px;
		border-radius: 6px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--bg);
		font-size: 13px;
		color: var(--ink);
	}
	.empty {
		padding: 8px;
		font-size: 12px;
		color: var(--muted);
	}
</style>
