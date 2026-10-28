<script lang="ts">
	import type { GpuixEvent } from 'gpuix-svelte';
	import { field, label_color, toggled, type Filter } from './filters.ts';
	import type { Notification } from './gh.ts';
	import { close } from './icons.ts';

	// The scope bar under the toolbar: one chip per filter applied. Board shows it only while there are any.
	let {
		items,
		filters,
		matching,
		onchange
	}: {
		items: Notification[];
		filters: Filter[];
		/** How many loaded notifications pass the filters. */
		matching: number;
		onchange: (filters: Filter[]) => void;
	} = $props();
</script>

<div class="bar">
	{#each filters as f (`${f.field}:${f.value}`)}
		<div
			class="chip"
			testId="chip-{f.field}-{f.value}"
			tabindex={0}
			onkeydown={(e: GpuixEvent) => ['enter', 'backspace', 'delete'].includes(e.key ?? '') && onchange(toggled(filters, f))}
		>
			<div class="chip-field">{field(f.field).title}</div>
			{#if f.field === 'label'}<div class="dot" style="background-color: #{label_color(items, f.value)}"></div>{/if}
			<div class="chip-value">{f.value}</div>
			<svg class="chip-x" source={close} testId="remove-{f.field}-{f.value}" onclick={() => onchange(toggled(filters, f))}></svg>
		</div>
	{/each}
	<div class="clear" testId="clear-filters" tabindex={0} onclick={() => onchange([])}>Clear</div>
	<div class="spacer"></div>
	<div class="matching">{matching} loaded match</div>
</div>

<style>
	.bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 16px;
		border-bottom-width: 1px;
		border-color: var(--separator);
		background-color: var(--toolbar);
		overflow: hidden;
	}
	.chip {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 2px 5px 2px 9px;
		border-radius: 11px;
		background-color: var(--tool-hover);
		font-size: 12px;
	}
	.chip:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
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
		border-radius: 7px;
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
		color: var(--accent);
		cursor: pointer;
	}
	.clear:hover {
		background-color: var(--tool-hover);
	}
	.clear:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
	}
	.spacer {
		flex-grow: 1;
	}
	.matching {
		font-size: 12px;
		color: var(--muted);
	}
</style>
