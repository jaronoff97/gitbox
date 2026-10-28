<script lang="ts">
	import { on_window_key } from 'gpuix-svelte';
	import { untrack } from 'svelte';
	import Lane from './Lane.svelte';
	import FilterBar from './FilterBar.svelte';
	import { matches, type Filter } from './filters.ts';
	import Settings from './Settings.svelte';
	import { notifications, PER_PAGE, viewer, type Notification } from './gh.ts';
	import { gear, sync } from './icons.ts';
	import { settings, update } from './settings.svelte.ts';

	/** Back to onboarding, for when gh stops working after setup (a logout, say). */
	let { onsetup }: { onsetup: () => void } = $props();

	const LANES = [
		{ key: 'todo', title: 'Todo', tone: 'muted' },
		{ key: 'requested', title: 'Requested', tone: 'warn' },
		{ key: 'waiting', title: 'Waiting on me', tone: 'accent' },
		{ key: 'done', title: 'Merged / Closed', tone: 'merged' }
	];

	/** The lane of a notification: a finished PR or issue is done, whatever the reason. */
	function lane_of(n: Notification): string {
		if (n.state === 'MERGED' || n.state === 'CLOSED') return 'done';
		if (n.reason === 'review_requested') return 'requested';
		// Someone named you, assigned you, or acted on a thread you opened.
		if (['mention', 'team_mention', 'assign', 'author'].includes(n.reason)) return 'waiting';
		return 'todo';
	}

	let items = $state<Notification[]>([]);
	/** How many cards each lane shows. After the start, only a scroll in that lane raises it, so a
	 * page fetched for one lane waits, out of sight, in the others until they scroll too. */
	let target = $state<Record<string, number>>({});
	let page = 0;
	let more = $state(true);
	let loading = $state(false);
	let error = $state('');
	let run = 0;
	/** A refresh keeps the old cards on screen until its first pages land. */
	let stale = $state(false);
	let show_settings = $state(false);
	let me = $state<{ login: string; avatar_url: string } | null>(null);

	viewer().then((v) => (me = v), () => {});

	let matching = $derived(items.filter((n) => matches(n, settings.filters)));

	let lanes = $derived(
		LANES.filter((l) => !(settings.hide_done && l.key === 'done')).map((l) => {
			const all = matching.filter((n) => lane_of(n) === l.key);
			const want = target[l.key] ?? 0;
			return { ...l, loaded: all.length, target: want, cards: all.slice(0, want) };
		})
	);

	/** Fetches pages, `settings.batch` at once, while some lane wants more cards than are loaded for it. */
	async function fill() {
		if (loading) return;
		const mine = run;
		loading = true;
		try {
			while (more && (stale || lanes.some((l) => l.loaded < l.target))) {
				const opts = { all: settings.include_read, participating: settings.participating };
				const pages = await Promise.all(
					Array.from({ length: settings.batch }, (_, k) => notifications(page + k + 1, opts))
				);
				if (mine !== run) return;
				page += settings.batch;
				if (stale) {
					items = [];
					stale = false;
				}
				for (const got of pages) {
					items.push(...got);
					// A short page is the last; any after it are empty.
					if (got.length < PER_PAGE) {
						more = false;
						break;
					}
				}
			}
		} catch (e) {
			if (mine === run) error = (e as Error).message;
		} finally {
			if (mine === run) loading = false;
		}
	}

	/** Bumped with every start-over, so each lane scrolls back to its top. */
	let epoch = $state(0);
	function reset_targets() {
		target = Object.fromEntries(LANES.map((l) => [l.key, settings.lane_size]));
		epoch++;
	}

	/** `lane_size` more cards in lane `key`: at once if they are loaded, else as pages arrive.
	 * ponytail: the API cannot filter by lane, so growing a sparse lane (Todo, say) can fetch every
	 * page before it finds enough cards; they show as each page arrives. */
	function grow(key: string) {
		target[key] = (lanes.find((l) => l.key === key)?.cards.length ?? 0) + settings.lane_size;
		fill();
	}

	/** Loads the board again; the cards on screen stay until the new ones come. */
	function start() {
		run++;
		page = 0;
		stale = true;
		reset_targets();
		more = true;
		loading = false;
		error = '';
		fill();
	}

	/** New filters start every lane over, fetching more pages if they thin it. */
	function filter(filters: Filter[]) {
		update({ filters });
		reset_targets();
		fill();
	}

	// The query settings change what the API returns, so they load the board again; this also loads it at first.
	$effect(() => {
		void settings.include_read;
		void settings.participating;
		untrack(start);
	});

	$effect(() => {
		void settings.lane_size;
		untrack(() => {
			reset_targets();
			fill();
		});
	});

	$effect(() => {
		const minutes = settings.refresh_minutes;
		if (!minutes) return;
		const timer = setInterval(() => !loading && start(), minutes * 60_000);
		return () => clearInterval(timer);
	});

	$effect(() =>
		on_window_key('keydown', (e) => {
			if (!e.modifiers?.cmd) return;
			if (e.key === 'r') start();
			else if (e.key === ',') show_settings = true;
		})
	);

	/** The end marker's text for a lane. */
	const status = (lane: (typeof lanes)[number]) =>
		loading && (stale || lane.loaded < lane.target)
			? 'Loading…'
			: more || lane.loaded > lane.cards.length
				? 'Scroll for more'
				: lane.cards.length
					? 'All caught up'
					: 'Nothing here';

</script>

<div class="page">
	<div class="header">
		<div class="brand">
			<div class="mark">
				{#each LANES as l (l.key)}<div class="bar" style="background-color: var(--{l.tone})"></div>{/each}
			</div>
			<div class="name">gitbox</div>
		</div>
		<div class="count">
			{items.length}{more ? '+' : ''} {settings.include_read ? 'notifications' : 'unread'}{loading ? ' · loading…' : ''}
		</div>


		<svg class="icon-btn" class:spin={loading} source={sync} testId="refresh" tabindex={0} onclick={start}></svg>
		<svg class="icon-btn" source={gear} testId="settings" tabindex={0} onclick={() => (show_settings = true)}></svg>
		{#if me}
			<div class="me">
				{#if me.avatar_url}<img class="me-avatar" src={me.avatar_url} alt={me.login} />{/if}
				<div>{me.login}</div>
			</div>
		{/if}
	</div>

	<FilterBar {items} filters={settings.filters} matching={matching.length} onchange={filter} />

	{#if error}
		<div class="msg">
			<div class="fail">{error}</div>
			<div class="btn" testId="setup" tabindex={0} onclick={onsetup}>Run setup again</div>
		</div>
	{/if}

	<div class="board">
		{#each lanes as lane (lane.key)}
			<Lane
				key={lane.key}
				title={lane.title}
				tone={lane.tone}
				cards={lane.cards}
				badge={`${lane.cards.length}${more || lane.loaded > lane.cards.length ? '+' : ''}`}
				status={status(lane)}
				reset={epoch}
				ongrow={() => !error && grow(lane.key)}
			/>
		{/each}
	</div>
</div>

{#if show_settings}
	<Settings login={me?.login ?? ''} onclose={() => (show_settings = false)} {onsetup} />
{/if}

<style>
	.page {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
	}
	.header {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 16px;
		border-bottom-width: 1px;
		border-color: var(--border);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.mark {
		display: flex;
		align-items: flex-end;
		gap: 2px;
		height: 16px;
	}
	.bar {
		width: 4px;
		height: 16px;
		border-radius: 2px;
	}
	.name {
		font-size: 15px;
		font-weight: bold;
		color: var(--ink);
	}
	.count {
		flex-grow: 1;
		padding-left: 6px;
		font-size: 12px;
		color: var(--muted);
	}
	.icon-btn {
		width: 16px;
		height: 16px;
		padding: 7px;
		border-radius: 7px;
		color: var(--muted);
		cursor: pointer;
	}
	.icon-btn:hover {
		color: var(--ink);
		background-color: var(--surface);
	}
	.icon-btn.spin {
		color: var(--accent);
	}
	.icon-btn:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
	}
	.me {
		display: flex;
		align-items: center;
		gap: 6px;
		padding-left: 6px;
		font-size: 12px;
		color: var(--muted);
	}
	.me-avatar {
		width: 22px;
		height: 22px;
		border-radius: 11px;
	}
	.msg {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 16px;
		background-color: var(--fail-bg);
	}
	.fail {
		flex-grow: 1;
		font-size: 12px;
		color: var(--fail);
	}
	.btn {
		padding: 5px 10px;
		border-radius: 6px;
		font-size: 12px;
		background-color: var(--surface);
		color: var(--ink);
		cursor: pointer;
	}
	.btn:hover {
		background-color: var(--border);
	}
	.board {
		display: flex;
		flex-grow: 1;
		flex-basis: 0;
		min-height: 0;
		gap: 12px;
		padding: 12px 12px 0px 12px;
	}
</style>
