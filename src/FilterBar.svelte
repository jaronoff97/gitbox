<script lang="ts">
	import Popover from 'gpuix-svelte/components/Popover.svelte';
	import { FIELDS, field, options, same, type Field, type Filter } from './filters.ts';
	import type { Notification } from './gh.ts';
	import { close, filter as filter_icon, left, right } from './icons.ts';

	let {
		items,
		filters,
		matching,
		onchange
	}: {
		/** The loaded notifications, which the menu offers values from. */
		items: Notification[];
		filters: Filter[];
		/** How many loaded notifications pass the filters. */
		matching: number;
		onchange: (filters: Filter[]) => void;
	} = $props();

	let open = $state(false);
	let picking = $state<Field | null>(null);
	let query = $state('');

	let values = $derived(
		picking ? options(items, picking).filter((o) => o.value.toLowerCase().includes(query.trim().toLowerCase())) : []
	);

	/** A label's colour, from any loaded notification that has it. */
	const label_color = (name: string) =>
		items.flatMap((n) => n.labels ?? []).find((l) => l.name === name)?.color ?? '7f849c';

	const is_on = (f: Filter) => filters.some((g) => same(f, g));
	const toggle = (f: Filter) => onchange(is_on(f) ? filters.filter((g) => !same(f, g)) : [...filters, f]);

	function pick(key: Field | null) {
		picking = key;
		query = '';
	}
</script>

<div class="bar">
	<Popover {open} onclose={() => (open = false)} testid="filter-menu" style="padding: 6px">
		<div class="add" testId="add-filter" tabindex={0} onclick={() => ((open = !open), pick(null))}>
			<svg class="add-icon" source={filter_icon}></svg>
			<div>Filter</div>
		</div>
		{#snippet content()}
			<div class="menu">
				{#if picking === null}
					{#each FIELDS as f (f.key)}
						{@const count = options(items, f.key).length}
						<div class="item" testId="field-{f.key}" onclick={() => pick(f.key)}>
							<div class="name">{f.title}</div>
							<div class="n">{count}</div>
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
							<div class="item" class:picked={is_on(f)} testId="value-{o.value}" onclick={() => toggle(f)}>
								<div class="check">{is_on(f) ? '✓' : ''}</div>
								{#if picking === 'label'}<div class="dot" style="background-color: #{label_color(o.value)}"></div>{/if}
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

	{#each filters as f (`${f.field}:${f.value}`)}
		<div class="chip" testId="chip-{f.field}-{f.value}">
			<div class="chip-field">{field(f.field).title}</div>
			{#if f.field === 'label'}<div class="dot" style="background-color: #{label_color(f.value)}"></div>{/if}
			<div class="chip-value">{f.value}</div>
			<svg class="chip-x" source={close} testId="remove-{f.field}-{f.value}" onclick={() => toggle(f)}></svg>
		</div>
	{/each}

	{#if filters.length}
		<div class="clear" testId="clear-filters" tabindex={0} onclick={() => onchange([])}>Clear</div>
		<div class="spacer"></div>
		<div class="matching">{matching} loaded match</div>
	{/if}
</div>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 6px;
		min-height: 40px;
		padding: 6px 16px;
		border-bottom-width: 1px;
		border-color: var(--border);
		overflow: hidden;
	}
	.add {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 10px;
		border-radius: 6px;
		font-size: 12px;
		color: var(--muted);
		cursor: pointer;
	}
	.add:hover {
		color: var(--ink);
		background-color: var(--surface);
	}
	.add:focus-visible,
	.clear:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
	}
	.add-icon {
		width: 14px;
		height: 14px;
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 6px 3px 9px;
		border-radius: 6px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--surface);
		font-size: 12px;
	}
	.chip-field {
		color: var(--muted);
	}
	.chip-value {
		max-width: 220px;
		color: var(--ink);
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}
	.chip-x {
		width: 14px;
		height: 14px;
		padding: 1px;
		border-radius: 4px;
		color: var(--muted);
		cursor: pointer;
	}
	.chip-x:hover {
		color: var(--ink);
		background-color: var(--border);
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 4px;
	}
	.clear {
		padding: 3px 8px;
		border-radius: 6px;
		font-size: 12px;
		color: var(--muted);
		cursor: pointer;
	}
	.clear:hover {
		color: var(--ink);
	}
	.spacer {
		flex-grow: 1;
	}
	.matching {
		font-size: 12px;
		color: var(--muted);
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
