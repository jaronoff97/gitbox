<script lang="ts">
	import { get_native, type GpuixEvent, type ShadowNode } from 'gpuix-svelte';
	import Popover from 'gpuix-svelte/components/Popover.svelte';
	import { notifications, PER_PAGE, type Notification } from './gh.ts';

	/** Back to onboarding, for when gh stops working after setup (a logout, say). */
	let { onsetup }: { onsetup: () => void } = $props();

	const LANES = [
		{ key: 'todo', title: 'Todo' },
		{ key: 'requested', title: 'Requested' },
		{ key: 'waiting', title: 'Waiting on me' },
		{ key: 'done', title: 'Merged / Closed' }
	];

	/** The lane of a notification: a finished PR or issue is done, whatever the reason. */
	function lane_of(n: Notification): string {
		if (n.state === 'MERGED' || n.state === 'CLOSED') return 'done';
		if (n.reason === 'review_requested') return 'requested';
		// Someone named you, assigned you, or acted on a thread you opened.
		if (['mention', 'team_mention', 'assign', 'author'].includes(n.reason)) return 'waiting';
		return 'todo';
	}

	const SIZE = 50;
	/** Pages fetched at once: 4 concurrent pages take about as long as 1 (1.4 s against 5.5 s). */
	const BATCH = 4;

	let items = $state<Notification[]>([]);
	/** How many cards each lane shows. After the start, only a scroll in that lane raises it, so a
	 * page fetched for one lane waits, out of sight, in the others until they scroll too. */
	let target = $state<Record<string, number>>({});
	let page = 0;
	let more = $state(true);
	let loading = $state(false);
	let error = $state('');
	let run = 0;
	/** The repositories to show; none picked shows them all. */
	let repos = $state<string[]>([]);
	let menu = $state(false);

	/** Every repository in the loaded notifications, busiest first, with its count. */
	let repo_counts = $derived(
		[...Map.groupBy(items, (n) => n.repository.full_name)]
			.map(([name, list]) => ({ name, count: list.length }))
			.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
	);

	let lanes = $derived(
		LANES.map((l) => {
			const all = items.filter(
				(n) => lane_of(n) === l.key && (repos.length === 0 || repos.includes(n.repository.full_name))
			);
			const want = target[l.key] ?? 0;
			return { ...l, loaded: all.length, target: want, cards: all.slice(0, want) };
		})
	);

	/** Fetches pages while some lane wants more cards than are loaded for it. */
	async function fill() {
		if (loading) return;
		const me = run;
		loading = true;
		try {
			while (more && lanes.some((l) => l.loaded < l.target)) {
				const pages = await Promise.all(Array.from({ length: BATCH }, (_, k) => notifications(page + k + 1)));
				if (me !== run) return;
				page += BATCH;
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
			if (me === run) error = (e as Error).message;
		} finally {
			if (me === run) loading = false;
		}
	}

	/** SIZE more cards in lane `key`: at once if they are loaded, else as pages arrive. */
	function grow(key: string) {
		target[key] = lanes.find((l) => l.key === key)!.cards.length + SIZE;
		fill();
	}

	/** A new filter starts every lane over at SIZE cards, fetching more pages if it thins them. */
	function filter(next: string[]) {
		repos = next;
		target = Object.fromEntries(LANES.map((l) => [l.key, SIZE]));
		fill();
	}

	const toggle = (name: string) => filter(repos.includes(name) ? repos.filter((r) => r !== name) : [...repos, name]);

	function start() {
		run++;
		page = 0;
		items = [];
		// Every lane starts at SIZE cards, so the first pages load until each has them (or none are left).
		target = Object.fromEntries(LANES.map((l) => [l.key, SIZE]));
		more = true;
		loading = false;
		error = '';
		fill();
	}

	start();

	// A lane grows only when you scroll down in it near its end: within 200 px of the lane's
	// bottom, measured on its card column (the end marker's parent). The column's
	// top is always on screen, so its painted bounds stay current; an off-screen marker keeps the
	// bounds of its last paint. A short lane is always near its end, so a scroll there grows it too.
	// ponytail: the API cannot filter by lane, so growing a sparse lane (Todo, say) can fetch every
	// page before it finds 50 more cards; they show as each page arrives.
	const lane_nodes: Record<string, ShadowNode> = {};
	const ends: Record<string, ShadowNode> = {};
	function near_end(key: string) {
		const native = get_native();
		const lane = lane_nodes[key]?.nativeId;
		const column = ends[key]?.parent?.nativeId;
		if (!native || lane == null || column == null) return false;
		const l = native.getElementBounds(lane);
		const c = native.getElementBounds(column);
		return !!l && !!c && c.y + c.height < l.y + l.height + 200;
	}

	// `scroll` is wheel input (negative is down). The check waits 100 ms for the scroll to paint.
	function on_wheel(key: string, e: GpuixEvent) {
		if ((e.deltaY ?? 0) >= 0) return;
		setTimeout(() => {
			if (!error && near_end(key)) grow(key);
		}, 100);
	}

	const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
</script>

<div class="page">
	<div class="header">
		<div class="title">Notifications</div>
		<div class="count">{items.length} unread{more ? '+' : ''}{loading ? ' · loading…' : ''}</div>
		<Popover open={menu} onclose={() => (menu = false)} align="end" testid="repos">
			<div class="btn" class:on={repos.length > 0} testId="repo-filter" tabindex={0} onclick={() => (menu = !menu)}>
				{repos.length === 0 ? 'All repositories' : repos.length === 1 ? repos[0] : `${repos.length} repositories`} ▾
			</div>
			{#snippet content()}
				<div class="menu">
					<div class="item" class:picked={repos.length === 0} testId="repo-all" onclick={() => filter([])}>
						<div class="check">{repos.length === 0 ? '✓' : ''}</div>
						<div class="name">All repositories</div>
					</div>
					{#each repo_counts as r (r.name)}
						<div class="item" class:picked={repos.includes(r.name)} testId="repo-{r.name}" onclick={() => toggle(r.name)}>
							<div class="check">{repos.includes(r.name) ? '✓' : ''}</div>
							<div class="name">{r.name}</div>
							<div class="n">{r.count}{more ? '+' : ''}</div>
						</div>
					{/each}
				</div>
			{/snippet}
		</Popover>
		<div class="btn" testId="refresh" tabindex={0} onclick={start}>Refresh</div>
	</div>

	{#if error}
		<div class="msg">
			<div class="fail">{error}</div>
			<div class="btn" testId="setup" tabindex={0} onclick={onsetup}>Run setup again</div>
		</div>
	{/if}

	<div class="board">
		{#each lanes as lane (lane.key)}
			<div
				class="lane"
				testId="lane-{lane.key}"
				onscroll={(e: GpuixEvent) => on_wheel(lane.key, e)}
				{@attach (node: ShadowNode) => (lane_nodes[lane.key] = node)}
			>
				<div class="lane-head">
					<div class="lane-title">{lane.title}</div>
					<div class="badge">{lane.cards.length}{more || lane.loaded > lane.cards.length ? '+' : ''}</div>
				</div>
				<!-- GPUI paints this thumb in the same frame as the scroll; Scroller's own thumb trails it. -->
				<div class="scroll">
					<div class="column">
						{#each lane.cards as n (n.id)}
							<div class="card" testId="card-{n.id}">
								<div class="repo">{n.repository.full_name}</div>
								<div class="card-title">{n.subject.title}</div>
								<div class="card-foot">
									<div class="tag">{n.subject.type}</div>
									<div class="tag" class:merged={n.state === 'MERGED'} class:closed={n.state === 'CLOSED'}>
										{lane.key === 'done' ? n.state!.toLowerCase() : n.reason.replaceAll('_', ' ')}
									</div>
									<div class="date">{day(n.updated_at)}</div>
								</div>
							</div>
						{/each}
						<div class="end" {@attach (node: ShadowNode) => (ends[lane.key] = node)}>
							{#if loading && lane.loaded < lane.target}
								Loading…
							{:else if more || lane.loaded > lane.cards.length}
								Scroll for more
							{:else}
								{lane.cards.length ? 'All caught up' : 'Nothing here'}
							{/if}
						</div>
					</div>
				</div>
			</div>
		{/each}
	</div>
</div>

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
		gap: 12px;
		padding: 12px 20px;
		border-bottom-width: 1px;
		border-color: var(--border);
	}
	.title {
		font-size: 18px;
		font-weight: bold;
		color: var(--ink);
	}
	.count {
		flex-grow: 1;
		color: var(--muted);
	}
	.msg {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 20px 0px 20px;
	}
	.fail {
		flex-grow: 1;
		color: var(--fail);
	}
	.board {
		display: flex;
		flex-grow: 1;
		flex-basis: 0;
		min-height: 0;
		gap: 12px;
		padding: 16px 16px 0px 16px;
	}
	.lane {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		flex-basis: 0;
		min-width: 0;
		gap: 10px;
		padding: 10px 6px 0px 10px;
		border-radius: 10px 10px 0px 0px;
		background-color: var(--lane);
	}
	.lane-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.lane-title {
		font-weight: semibold;
		color: var(--ink);
	}
	.badge {
		font-size: 12px;
		color: var(--muted);
	}
	.card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 100%;
		padding: 10px 12px;
		border-radius: 8px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--surface);
	}
	.card:hover {
		border-color: var(--muted);
	}
	.repo {
		font-size: 12px;
		color: var(--accent);
		text-overflow: ellipsis;
		white-space: nowrap;
		overflow: hidden;
	}
	.card-title {
		font-size: 13px;
		color: var(--ink);
		line-clamp: 3;
	}
	.card-foot {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 11px;
		color: var(--muted);
	}
	.tag {
		padding: 0px 6px;
		border-radius: 4px;
		background-color: var(--border);
	}
	.tag.merged {
		color: var(--merged);
	}
	.tag.closed {
		color: var(--fail);
	}
	.date {
		flex-grow: 1;
		text-align: right;
	}
	.scroll {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		flex-basis: 0;
		min-height: 0;
		padding-right: 10px;
		overflow-y: scroll;
		scrollbar-color: var(--thumb);
		scrollbar-width: 6px;
	}
	.column {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding-bottom: 12px;
	}
	.end {
		padding: 8px 0px;
		font-size: 12px;
		text-align: center;
		color: var(--muted);
	}
	.btn {
		padding: 6px 12px;
		border-radius: 6px;
		background-color: var(--surface);
		color: var(--ink);
		cursor: pointer;
	}
	.btn:hover {
		background-color: var(--border);
	}
	.btn.on {
		color: var(--accent);
	}
	.menu {
		display: flex;
		flex-direction: column;
		width: 340px;
		max-height: 420px;
		padding-right: 6px;
		overflow-y: scroll;
		scrollbar-color: var(--thumb);
	}
	.item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		border-radius: 6px;
		color: var(--ink);
		cursor: pointer;
	}
	.item:hover {
		background-color: var(--border);
	}
	.item.picked {
		color: var(--accent);
	}
	.check {
		width: 14px;
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
	.btn:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
	}
</style>
