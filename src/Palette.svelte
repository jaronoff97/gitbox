<script lang="ts">
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import { on_window_key, type GpuixEvent } from 'gpuix-svelte';
	import { untrack } from 'svelte';
	import { caps, commands, enabled, GROUPS, keys_claimed } from './commands.svelte.ts';
	import { FIELDS, options, same, toggled, type Field, type Filter } from './filters.ts';
	import { score } from './fuzzy.ts';
	import type { Notification } from './gh.ts';
	import { list_nav } from './listnav.svelte.ts';
	import { load, save } from './store.ts';

	// ⌘K (#6): one search over the commands in the registry (#4), filters, lanes and loaded
	// notifications. A command runs exactly as its shortcut would.
	let {
		items,
		filters,
		lanes,
		onfilter,
		onlane,
		onopen,
		onfocus,
		onclose
	}: {
		items: Notification[];
		filters: Filter[];
		lanes: { key: string; title: string }[];
		onfilter: (filters: Filter[]) => void;
		onlane: (key: string) => void;
		onopen: (n: Notification) => void;
		/** ⌘↩ on a notification: focus its card rather than open it. */
		onfocus: (n: Notification) => void;
		onclose: () => void;
	} = $props();

	type Entry = {
		key: string;
		kind: 'command' | 'filter' | 'lane' | 'notification';
		title: string;
		group: string;
		keys?: string;
		checked?: boolean;
		run: () => void;
		alt?: () => void;
	};

	const RANK = { command: 3, filter: 2, lane: 1, notification: 0 };
	const LIMIT = 50;
	const RECENT = 5;

	let query = $state('');
	let recent = $state<string[]>(load().recent ?? []);

	/** Runs a command and remembers it at the top of the empty palette. */
	function remember(id: string) {
		recent = [id, ...recent.filter((r) => r !== id)].slice(0, RECENT);
		save({ recent });
	}

	let all = $derived.by((): Entry[] => {
		const group = (g: string) => GROUPS.find((x) => x.key === g)?.title ?? g;
		const cmds: Entry[] = commands()
			.filter((c) => c.id !== 'edit.palette' && enabled(c))
			.map((c) => ({
				key: c.id,
				kind: 'command',
				title: c.title,
				group: group(c.group),
				keys: c.keys,
				checked: c.checked?.(),
				run: () => (remember(c.id), c.run())
			}));
		const filter_entries: Entry[] = FIELDS.flatMap((f) =>
			options(items, f.key).map(({ value }) => {
				const fl = { field: f.key as Field, value };
				const on = filters.some((g) => same(g, fl));
				return {
					key: `filter:${f.key}:${value}`,
					kind: 'filter' as const,
					title: `${on ? 'Remove filter' : 'Filter'}: ${f.title} ${value}`,
					group: 'Filter',
					run: () => onfilter(toggled(filters, fl))
				};
			})
		);
		const lane_entries: Entry[] = lanes.map((l) => ({
			key: `lane:${l.key}`,
			kind: 'lane',
			title: `Go to ${l.title}`,
			group: 'Go',
			run: () => onlane(l.key)
		}));
		const notes: Entry[] = items.map((n) => ({
			key: `n:${n.id}`,
			kind: 'notification',
			title: `Open: ${n.subject.title}`,
			group: n.repository.full_name,
			run: () => onopen(n),
			alt: () => onfocus(n)
		}));
		return [...cmds, ...filter_entries, ...lane_entries, ...notes];
	});

	let results = $derived.by((): Entry[] => {
		const q = query.trim();
		// > commands only, # filters only, @ authors only.
		const prefix = q[0];
		const rest = ['>', '#', '@'].includes(prefix) ? q.slice(1) : q;
		let pool = all;
		if (prefix === '>') pool = all.filter((e) => e.kind === 'command');
		else if (prefix === '#') pool = all.filter((e) => e.kind === 'filter');
		else if (prefix === '@') pool = all.filter((e) => e.key.startsWith('filter:author:'));
		if (!rest.trim()) {
			if (q) return pool.slice(0, LIMIT);
			const recents = recent.map((id) => all.find((e) => e.key === id)).filter((e) => e !== undefined);
			return [...recents, ...all.filter((e) => e.kind === 'command' && !recent.includes(e.key))].slice(0, LIMIT);
		}
		return pool
			.map((e) => ({ e, s: score(rest, e.title) }))
			.filter((x): x is { e: Entry; s: number } => x.s !== null)
			.sort((a, b) => b.s - a.s || RANK[b.e.kind] - RANK[a.e.kind])
			.slice(0, LIMIT)
			.map((x) => x.e);
	});

	function go(e: Entry | undefined, alt = false) {
		if (!e) return;
		onclose();
		(alt && e.alt ? e.alt : e.run)();
	}

	const { nav, submit } = list_nav({
		active: () => true,
		count: () => results.length,
		pick: (i) => go(results[i])
	});

	// While open, the palette's keys are its own: the board's arrows and single keys wait.
	$effect(() => {
		untrack(() => keys_claimed.by++);
		return () => untrack(() => void keys_claimed.by--);
	});

	// ⎋ closes; ⌘↩ takes a notification's other action (focus its card).
	$effect(() =>
		on_window_key('keydown', (e: GpuixEvent) => {
			if (e.key === 'escape') onclose();
			else if (e.key === 'enter' && e.modifiers?.cmd) go(results[nav.index], true);
		})
	);
</script>

<Portal>
	<div class="scrim" onclick={onclose}>
		<div class="panel" testId="palette" onclick={() => {}}>
			<input
				class="search"
				value={query}
				placeholder="Search commands, filters and notifications…  (> commands, # filters, @ authors)"
				testId="palette-search"
				autofocus
				onchange={(e: GpuixEvent) => ((query = e.value ?? ''), (nav.index = 0))}
				onsubmit={submit}
			/>
			<div class="results">
				{#each results as r, i (r.key)}
					<div class="row" class:active={i === nav.index} testId="palette-{r.key}" onclick={() => go(r)}>
						<div class="check">{r.checked ? '✓' : ''}</div>
						<div class="title">{r.title}</div>
						<div class="group">{r.group}</div>
						{#if r.keys}
							<div class="caps">
								{#each caps(r.keys) as cap, j (j)}<div class="cap">{cap}</div>{/each}
							</div>
						{/if}
					</div>
				{:else}
					<div class="empty">No matches</div>
				{/each}
			</div>
		</div>
	</div>
</Portal>

<style>
	.scrim {
		position: absolute;
		top: 0px;
		left: 0px;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 90px;
		background-color: var(--scrim);
		/* GPUI scrolls every scroll container under the pointer; this hides the board from the wheel. */
		pointer-events: auto;
	}
	.panel {
		display: flex;
		flex-direction: column;
		width: 640px;
		max-height: 70%;
		border-radius: 14px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--surface);
		overflow: hidden;
	}
	.search {
		padding: 14px 16px;
		border-bottom-width: 1px;
		border-color: var(--border);
		font-size: 15px;
		color: var(--ink);
		background-color: var(--surface);
	}
	.results {
		display: flex;
		flex-direction: column;
		padding: 6px;
		overflow-y: scroll;
		scrollbar-color: var(--thumb);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 10px;
		border-radius: 7px;
		cursor: pointer;
	}
	.row:hover,
	.row.active {
		background-color: var(--border);
	}
	.check {
		width: 12px;
		font-size: 12px;
		color: var(--accent);
	}
	.title {
		flex-grow: 1;
		min-width: 0;
		font-size: 13px;
		color: var(--ink);
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}
	.group {
		max-width: 220px;
		font-size: 11px;
		color: var(--muted);
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}
	.caps {
		display: flex;
		gap: 3px;
	}
	.cap {
		min-width: 14px;
		padding: 1px 5px;
		border-radius: 5px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--bg);
		font-size: 11px;
		text-align: center;
		color: var(--muted);
	}
	.empty {
		padding: 14px;
		font-size: 13px;
		color: var(--muted);
	}
</style>
