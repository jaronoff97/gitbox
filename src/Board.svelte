<script lang="ts">
	import { on_window_key } from 'gpuix-svelte';
	import Tooltip from 'gpuix-svelte/components/Tooltip.svelte';
	import { untrack } from 'svelte';
	import Lane from './Lane.svelte';
	import CardActions from './CardActions.svelte';
	import Toast from './Toast.svelte';
	import FilterBar from './FilterBar.svelte';
	import FilterMenu from './FilterMenu.svelte';
	import { matches, type Filter } from './filters.ts';
	import Settings from './Settings.svelte';
	import * as gh from './gh.ts';
	import { notifications, PER_PAGE, viewer, type Action, type Notification } from './gh.ts';
	import { gear, sync } from './icons.ts';
	import { settings, update, type Sort } from './settings.svelte.ts';

	/** On macOS the toolbar is the title bar (app.ts makes it transparent) and leaves room for the traffic lights. */
	const MAC = process.platform === 'darwin';

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
	let menu = $state<{ n: Notification; x: number; y: number } | null>(null);
	/** A card action's dialog is open: ⌘↩ is its key then (the comment dialog sends with it). */
	let dialog = $state(false);
	type Note = { id: number; text: string; error: boolean; open?: () => void };
	let toasts = $state<Note[]>([]);
	let toast_id = 0;

	/** Shows `text`; with `open`, the toast offers ⌘↩ (or a click) to open what the action touched. */
	function toast(text: string, error = false, open?: () => void) {
		const id = ++toast_id;
		toasts.push({ id, text, error, open });
		setTimeout(() => dismiss(id), error ? 7000 : open ? 6000 : 3000);
	}
	const dismiss = (id: number) => (toasts = toasts.filter((t) => t.id !== id));

	/** ⌘↩: opens what the newest toast that can still open points at, and closes that toast. */
	function open_toast(t = toasts.findLast((t) => t.open)) {
		if (!t?.open) return;
		t.open();
		dismiss(t.id);
	}

	type Change = Exclude<Action, 'open' | 'copy'>;
	/** Each action that changes GitHub: its gh call, the toast when it works, and the verb when it fails. */
	const ACTIONS: Record<Change, { run: (n: Notification, body?: string) => Promise<unknown>; done: string; verb: string }> = {
		read: { run: gh.mark_read, done: 'Marked as read', verb: 'mark as read' },
		done: { run: gh.mark_done, done: 'Marked as done', verb: 'mark as done' },
		unsubscribe: { run: gh.unsubscribe, done: 'Unsubscribed', verb: 'unsubscribe' },
		close: { run: (n) => gh.set_state(n, 'closed'), done: 'Closed', verb: 'close' },
		'close-not-planned': { run: (n) => gh.set_state(n, 'closed', 'not planned'), done: 'Closed as not planned', verb: 'close' },
		reopen: { run: (n) => gh.set_state(n, 'open'), done: 'Reopened', verb: 'reopen' },
		comment: { run: (n, body) => gh.comment(n, body ?? ''), done: 'Comment posted', verb: 'post the comment' }
	};

	/** Runs a card action: the board changes at once, and changes back if gh fails. */
	async function act(action: Action, n: Notification, body?: string): Promise<boolean> {
		try {
			if (action === 'open') return (gh.open_url(await gh.link(n)), true);
			if (action === 'copy') {
				const url = await gh.link(n);
				await gh.copy(url);
				return (toast('Link copied', false, () => gh.open_url(url)), true);
			}
		} catch (e) {
			return (toast((e as Error).message, true), false);
		}
		const at = items.indexOf(n);
		const before = { unread: n.unread, state: n.state };
		// Read stays on the board only while it shows read notifications.
		const remove = action === 'done' || action === 'unsubscribe' || (action === 'read' && !settings.include_read);
		if (remove && at >= 0) items.splice(at, 1);
		else if (action === 'read') n.unread = false;
		else if (action === 'close' || action === 'close-not-planned') n.state = 'CLOSED';
		else if (action === 'reopen') n.state = 'OPEN';
		try {
			const out = await ACTIONS[action].run(n, body);
			// gh prints a new comment's URL; anything else opens the PR or issue.
			const url = typeof out === 'string' ? out.match(/https:\/\/\S+/)?.[0] : undefined;
			toast(ACTIONS[action].done, false, () => (url ? gh.open_url(url) : void gh.link(n).then(gh.open_url)));
			return true;
		} catch (e) {
			if (remove && at >= 0) items.splice(Math.min(at, items.length), 0, n);
			else Object.assign(n, before);
			toast(`Could not ${ACTIONS[action].verb}: ${(e as Error).message}`, true);
			return false;
		}
	}
	let me = $state<{ login: string; avatar_url: string } | null>(null);

	viewer().then((v) => (me = v), () => {});

	let matching = $derived(items.filter((n) => matches(n, settings.filters)));

	let lanes = $derived(
		LANES.filter((l) => !(settings.hide_done && l.key === 'done')).map((l) => {
			const sort: Sort = settings.lane_sort[l.key] ?? 'desc';
			const all = matching
				.filter((n) => lane_of(n) === l.key)
				.toSorted((a, b) => (sort === 'asc' ? 1 : -1) * a.updated_at.localeCompare(b.updated_at));
			const want = target[l.key] ?? 0;
			// The API sends newest first, so oldest first needs the whole lane loaded; until then it would
			// show only the oldest of what has come so far.
			const waiting = sort === 'asc' && more;
			return { ...l, sort, waiting, loaded: all.length, target: want, cards: waiting ? [] : all.slice(0, want) };
		})
	);

	/** Fetches pages, `settings.batch` at once, while some lane wants more cards than are loaded for it. */
	async function fill() {
		if (loading) return;
		const mine = run;
		loading = true;
		try {
			while (more && (stale || lanes.some((l) => l.sort === 'asc' || l.loaded < l.target))) {
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

	/** Flips lane `key` between newest and oldest first, from its top; oldest first loads the whole lane. */
	function flip(key: string) {
		const sort: Sort = (settings.lane_sort[key] ?? 'desc') === 'desc' ? 'asc' : 'desc';
		update({ lane_sort: { ...settings.lane_sort, [key]: sort } });
		target[key] = settings.lane_size;
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
			// In a dialog or a text field, ⌘↩ belongs to them.
			if (e.key === 'enter' && !dialog && !e.editing) open_toast();
			else if (e.key === 'r') start();
			else if (e.key === ',') show_settings = true;
		})
	);

	/** The end marker's text for a lane. */
	const status = (lane: (typeof lanes)[number]) =>
		lane.waiting
			? 'Loading the oldest…'
			: loading && (stale || lane.loaded < lane.target)
			? 'Loading…'
			: more || lane.loaded > lane.cards.length
				? 'Scroll for more'
				: lane.cards.length
					? 'All caught up'
					: 'Nothing here';

</script>

<div class="page">
	<div class="toolbar" class:mac={MAC}>
		<div class="titles">
			<div class="title">Gitbox</div>
			<div class="subtitle">
				{items.length}{more ? '+' : ''} {settings.include_read ? 'notifications' : 'unread'}{loading ? ' · loading…' : ''}
			</div>
		</div>
		<div class="grow"></div>
		<FilterMenu {items} filters={settings.filters} onchange={filter} />
		<Tooltip content="Refresh (⌘R)" side="bottom">
			{#snippet children(hover)}
				<div class="tool" class:busy={loading} {...hover} hitbox="self" testId="refresh" tabindex={0} onclick={start}>
					<svg class="icon" source={sync}></svg>
				</div>
			{/snippet}
		</Tooltip>
		<Tooltip content="Settings (⌘,)" side="bottom">
			{#snippet children(hover)}
				<div class="tool" {...hover} hitbox="self" testId="settings" tabindex={0} onclick={() => (show_settings = true)}>
					<svg class="icon" source={gear}></svg>
				</div>
			{/snippet}
		</Tooltip>
		{#if me?.avatar_url}
			<Tooltip content={`Signed in as ${me.login}`} side="bottom" align="end">
				<img class="me" src={me.avatar_url} alt={me.login} />
			</Tooltip>
		{/if}
	</div>

	{#if settings.filters.length}
		<FilterBar {items} filters={settings.filters} matching={matching.length} onchange={filter} />
	{/if}

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
				sort={lane.sort}
				reset={`${epoch}:${lane.sort}`}
				onsort={() => flip(lane.key)}
				onmenu={(n, x, y) => (menu = { n, x, y })}
				ongrow={() => !error && grow(lane.key)}
			/>
		{/each}
	</div>
</div>

<CardActions target={menu} onclose={() => (menu = null)} onrun={act} ondialog={(open) => (dialog = open)} />
<Toast {toasts} onopen={open_toast} />

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
	.toolbar {
		display: flex;
		align-items: center;
		gap: 4px;
		height: 52px;
		flex-shrink: 0;
		padding: 0px 14px 0px 16px;
		border-bottom-width: 1px;
		border-color: var(--separator);
		background-color: var(--toolbar);
		user-select: none;
	}
	.toolbar.mac {
		/* The traffic lights (app.ts places them at x 20) and the gap after them. */
		padding-left: 92px;
	}
	.titles {
		display: flex;
		flex-direction: column;
	}
	.title {
		font-size: 13px;
		font-weight: bold;
		color: var(--ink);
	}
	.subtitle {
		font-size: 11px;
		color: var(--muted);
	}
	.grow {
		flex-grow: 1;
	}
	.tool {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 28px;
		border-radius: 6px;
		color: var(--muted);
		cursor: pointer;
	}
	.tool:hover {
		color: var(--ink);
		background-color: var(--tool-hover);
	}
	.tool.busy {
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
	.me {
		width: 22px;
		height: 22px;
		margin-left: 8px;
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
