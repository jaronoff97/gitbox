<script lang="ts">
	import Tooltip from 'gpuix-svelte/components/Tooltip.svelte';
	import { untrack } from 'svelte';
	import Lane from './Lane.svelte';
	import CardActions from './CardActions.svelte';
	import Toast from './Toast.svelte';
	import FilterBar from './FilterBar.svelte';
	import FilterMenu from './FilterMenu.svelte';
	import { matches, type Filter } from './filters.ts';
	import Settings from './Settings.svelte';
	import Shortcuts from './Shortcuts.svelte';
	import Palette from './Palette.svelte';
	import { register } from './commands.svelte.ts';
	import { card_nodes } from './card_nodes.ts';
	import { get_native } from 'gpuix-svelte';
	import * as gh from './gh.ts';
	import { notifications, PER_PAGE, viewer, type Action, type Notification } from './gh.ts';
	import { gear, sync } from './icons.ts';
	import { track } from './jobs.svelte.ts';
	import { open_pr } from './whiteboard.ts';
	import { LANE_TITLES, lane_shown, settings, toggle_lane, update, type Sort } from './settings.svelte.ts';

	/** Back to onboarding, for when gh stops working after setup (a logout, say). `active`: the
	 * sidebar's Inbox tab is open; when it isn't, the board stays loaded but hidden, and its keys rest. */
	let { active = true, onsetup }: { active?: boolean; onsetup: () => void } = $props();

	const LANES = [
		{ key: 'todo', title: LANE_TITLES.todo, tone: 'muted' },
		{ key: 'requested', title: LANE_TITLES.requested, tone: 'warn' },
		{ key: 'waiting', title: LANE_TITLES.waiting, tone: 'accent' },
		{ key: 'done', title: LANE_TITLES.done, tone: 'merged' }
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
	let show_shortcuts = $state(false);
	let filters_open = $state(false);
	let palette_open = $state(false);
	let menu = $state<{ list: Notification[]; x: number; y: number } | null>(null);
	/** The selection (#3): thread ids, as the lanes are windowed and most cards aren't mounted. */
	let selected = $state(new Set<string>());
	/** The last card clicked into the selection, where a ⇧-click range starts. */
	let anchor: string | null = null;
	/** The lane under the pointer, for ⌘A. */
	let hover_lane: string | null = null;
	let progress = $state<{ verb: string; done: number; total: number } | null>(null);
	/** The keyboard focus (#5): a card, by lane and id; `index` keeps its place when the card leaves. */
	let focus = $state<{ lane: string; id: string; index: number } | null>(null);
	/** An action the keyboard asked for, which CardActions runs as its menu would (with any dialog). */
	let request = $state<{ action: Action; list: Notification[]; seq: number } | null>(null);
	let request_seq = 0;
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

	type Change = Exclude<Action, 'open' | 'copy' | 'whiteboard'>;
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

	/** Changes the board for `action` on `n` now, before gh answers; returns what puts it back. */
	function apply(action: Change, n: Notification): () => void {
		const before = { unread: n.unread, state: n.state };
		// Read stays on the board only while it shows read notifications.
		const remove = action === 'done' || action === 'unsubscribe' || (action === 'read' && !settings.include_read);
		const at = items.indexOf(n);
		if (remove && at >= 0) items.splice(at, 1);
		else if (action === 'read') n.unread = false;
		else if (action === 'close' || action === 'close-not-planned') n.state = 'CLOSED';
		else if (action === 'reopen') n.state = 'OPEN';
		// Lanes sort by time, so where it goes back in `items` doesn't change where it shows.
		return () => (remove && at >= 0 ? items.push(n) : Object.assign(n, before));
	}

	/** Runs a card action: the board changes at once, and changes back if gh fails. */
	async function act(action: Action, n: Notification, body?: string): Promise<boolean> {
		try {
			if (action === 'open') return (gh.open_url(await gh.link(n)), true);
			if (action === 'whiteboard') return (toast(await open_pr(n)), true);
			if (action === 'copy') {
				const url = await gh.link(n);
				await gh.copy(url);
				return (toast('Link copied', false, () => gh.open_url(url)), true);
			}
		} catch (e) {
			return (toast((e as Error).message, true), false);
		}
		const undo = apply(action, n);
		try {
			const out = await ACTIONS[action].run(n, body);
			// gh prints a new comment's URL; anything else opens the PR or issue.
			const url = typeof out === 'string' ? out.match(/https:\/\/\S+/)?.[0] : undefined;
			toast(ACTIONS[action].done, false, () => (url ? gh.open_url(url) : void gh.link(n).then(gh.open_url)));
			return true;
		} catch (e) {
			undo();
			toast(`Could not ${ACTIONS[action].verb}: ${(e as Error).message}`, true);
			return false;
		}
	}

	/** An action on several cards (#3): all change at once, the calls run 4 at a time with progress
	 * in the selection bar, and only the cards whose calls fail change back and stay selected. */
	async function bulk(action: Action, list: Notification[]): Promise<boolean> {
		if (action === 'open') {
			for (const n of list) gh.link(n).then(gh.open_url);
			return true;
		}
		if (action === 'copy') {
			const urls = await Promise.all(list.map(gh.link));
			return gh.copy(urls.join('\n')).then(
				() => (toast(`Copied ${list.length} links`), true),
				(e: Error) => (toast(e.message, true), false)
			);
		}
		if (action === 'comment' || action === 'whiteboard') return false;
		const undo = new Map(list.map((n) => [n, apply(action, n)]));
		progress = { verb: DOING[action](list.length), done: 0, total: list.length };
		const failed = await gh.pool(list, 4, (n) => ACTIONS[action].run(n).finally(() => progress && progress.done++));
		progress = null;
		for (const { item } of failed) undo.get(item)!();
		selected = new Set(failed.map((f) => f.item.id));
		if (failed.length)
			toast(`${failed.length} of ${list.length} failed: ${failed[0].error.message}`, true);
		else toast(`${ACTIONS[action].done} (${list.length})`);
		return failed.length === 0;
	}

	/** The selection bar's text while a bulk action runs: "Marking 40 as done". */
	const DOING: Record<Change, (k: number) => string> = {
		read: (k) => `Marking ${k} as read`,
		done: (k) => `Marking ${k} as done`,
		unsubscribe: (k) => `Unsubscribing from ${k}`,
		close: (k) => `Closing ${k}`,
		'close-not-planned': (k) => `Closing ${k}`,
		reopen: (k) => `Reopening ${k}`,
		comment: (k) => `Commenting on ${k}`
	};

	const focused = () => {
		const f = focus;
		return f ? (lanes.find((l) => l.key === f.lane)?.cards.find((c) => c.id === f.id) ?? null) : null;
	};

	/** Bumped when a key moves the focus: the lane scrolls that card into view. A click doesn't. */
	let reveal = $state(0);

	function focus_at(lane: (typeof lanes)[number] | undefined, index: number, by_key = true) {
		if (!lane?.cards.length) return;
		const i = Math.max(0, Math.min(index, lane.cards.length - 1));
		focus = { lane: lane.key, id: lane.cards[i].id, index: i };
		if (by_key) reveal++;
	}

	// A focused card that leaves (done, a filter) hands the focus to the card that takes its place.
	$effect(() => {
		const f = focus;
		if (!f) return;
		const lane = lanes.find((l) => l.key === f.lane);
		if (!lane?.cards.length) return void (focus = null);
		const i = lane.cards.findIndex((c) => c.id === f.id);
		if (i < 0) focus_at(lane, f.index, false);
		else if (i !== f.index) focus = { ...f, index: i };
	});

	/** j and k: the next or previous card; the first key focuses the lane under the pointer. */
	function move(step: number) {
		const f = focus;
		const lane = lanes.find((l) => l.key === (f?.lane ?? hover_lane)) ?? lanes.find((l) => l.cards.length);
		if (!f || !lane) return focus_at(lane, 0);
		focus_at(lane, f.index + step);
		// At the last card, j asks for more, as a scroll to the end does.
		if (step > 0 && f.index + step >= lane.cards.length - 1) grow(lane.key);
	}

	/** h and l: the next or previous lane that has cards, at the same row. */
	function move_lane(step: number) {
		const f = focus;
		const full = lanes.filter((l) => l.cards.length);
		if (!f) return move(0);
		const at = full.findIndex((l) => l.key === f.lane);
		focus_at(full[Math.max(0, Math.min(at + step, full.length - 1))], f.index);
	}

	/** What a card key acts on: the selection if the focused card is in it, else the focused card. */
	const targets = () => {
		const n = focused();
		return !n ? [] : selected.has(n.id) && selected.size > 1 ? selection : [n];
	};
	const ask = (action: Action) => (request = { action, list: targets(), seq: ++request_seq });

	/** Shift+F10: the context menu at the focused card, as a right click would open it. */
	function menu_at_focus() {
		const n = focused();
		const node = n && card_nodes.get(n.id);
		const b = node?.nativeId == null ? null : get_native()?.getElementBounds(node.nativeId);
		if (n && b) open_menu(n, b.x + 24, b.y + 24);
	}

	/** ⌘-click toggles `n`; ⇧-click adds the range from the anchor, by the lane's order. */
	function select(n: Notification, how: 'toggle' | 'range') {
		const lane = lanes.find((l) => l.cards.includes(n));
		const from = lane?.cards.findIndex((c) => c.id === anchor) ?? -1;
		const next = new Set(selected);
		if (how === 'range' && lane && from >= 0) {
			const to = lane.cards.indexOf(n);
			for (const c of lane.cards.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(c.id);
		} else if (next.has(n.id)) next.delete(n.id);
		else next.add(n.id);
		anchor = n.id;
		selected = next;
	}

	/** ⌘A: the lane under the pointer; again, when it is all selected, the whole board. */
	function select_all() {
		const lane = lanes.find((l) => l.key === hover_lane);
		const lane_ids = lane?.cards.map((n) => n.id) ?? [];
		const whole = !lane || lane_ids.every((id) => selected.has(id));
		selected = new Set(whole ? lanes.flatMap((l) => l.cards.map((n) => n.id)) : [...selected, ...lane_ids]);
	}

	/** A right click on a selected card acts on the whole selection; on another card, on that card. */
	function open_menu(n: Notification, x: number, y: number) {
		menu = { list: selected.has(n.id) && selected.size > 1 ? selection : [n], x, y };
	}

	const run_action = (action: Action, list: Notification[], body?: string) =>
		// Whiteboard opens one PR at a time.
		list.length === 1 || action === 'whiteboard' ? act(action, list[0], body) : bulk(action, list);
	let me = $state<{ login: string; avatar_url: string } | null>(null);

	viewer().then((v) => (me = v), () => {});

	let matching = $derived(items.filter((n) => matches(n, settings.filters)));

	let lanes = $derived(
		settings.lanes
			.filter((s) => s.shown)
			.map((s) => LANES.find((l) => l.key === s.key))
			.filter((l) => l !== undefined)
			.map((l) => {
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
	/** The selected cards, in board order. */
	let selection = $derived(lanes.flatMap((l) => l.cards).filter((n) => selected.has(n.id)));

	// A filter, a refresh or a sort can hide selected cards; they leave the selection.
	$effect(() => {
		const shown = new Set(selection.map((n) => n.id));
		if (shown.size !== untrack(() => selected.size)) selected = shown;
	});



	/** Fetches pages, `settings.batch` at once, while some lane wants more cards than are loaded for it. */
	async function fill() {
		if (loading) return;
		const mine = run;
		loading = true;
		// The progress popup (src/Jobs.svelte) shows the load while it runs.
		await track(stale ? 'Refreshing inbox' : 'Loading notifications', async (job) => {
			let fetched = 0;
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
						fetched += got.length;
						job.detail = `${fetched} notifications`;
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
		});
	}

	/** The refresh button and ⌘R: not while a load runs, so a second press can't start it over. */
	const refresh = () => !loading && start();

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

	/** A dialog or menu is open: board keys (Escape, ⌘A, ⌘↩) leave it alone. */
	const modal = () => !active || dialog || menu !== null || filters_open || show_settings || show_shortcuts;

	// The board's commands (#4): the keys, the ⌘/ overlay, the palette and the menu bar read them.
	$effect(() =>
		register([
			{ id: 'app.settings', title: 'Settings…', group: 'app', keys: 'cmd-,', when: () => !show_settings, run: () => (show_settings = true) },
			{ id: 'file.refresh', title: 'Refresh', group: 'file', keys: 'cmd-r', when: () => !loading, run: refresh },
			{
				id: 'file.open-toast',
				title: 'Open What the Last Action Touched',
				group: 'file',
				keys: 'cmd-enter',
				skip_editing: true,
				when: () => !modal() && toasts.some((t) => t.open),
				run: () => open_toast()
			},
			{ id: 'edit.select-all', title: 'Select All Cards', group: 'edit', keys: 'cmd-a', skip_editing: true, when: () => !modal(), run: select_all },
			{
				id: 'edit.deselect',
				title: 'Clear Selection',
				group: 'edit',
				keys: 'escape',
				when: () => !modal() && !palette_open && selected.size > 0,
				run: () => (selected = new Set())
			},
			...LANES.map((l, i) => ({
				id: `view.lane.${l.key}`,
				title: `Show ${l.title}`,
				group: 'view' as const,
				keys: `cmd-${i + 1}`,
				checked: () => lane_shown(l.key),
				run: () => toggle_lane(l.key)
			})),
			{
				id: 'view.include-read',
				title: 'Include Read',
				group: 'view',
				checked: () => settings.include_read,
				run: () => update({ include_read: !settings.include_read })
			},
			{
				id: 'view.participating',
				title: 'Participating Only',
				group: 'view',
				checked: () => settings.participating,
				run: () => update({ participating: !settings.participating })
			},
			{ id: 'view.clear-filters', title: 'Clear Filters', group: 'view', keys: 'alt-cmd-f', when: () => settings.filters.length > 0, run: () => filter([]) },
			// Keyboard navigation (#5).
			{ id: 'go.next', title: 'Next Card', group: 'go', keys: 'j', also: ['down'], when: () => !modal(), run: () => move(1) },
			{ id: 'go.previous', title: 'Previous Card', group: 'go', keys: 'k', also: ['up'], when: () => !modal(), run: () => move(-1) },
			{ id: 'go.next-lane', title: 'Next Lane', group: 'go', keys: 'l', also: ['right'], when: () => !modal(), run: () => move_lane(1) },
			{ id: 'go.previous-lane', title: 'Previous Lane', group: 'go', keys: 'h', also: ['left'], when: () => !modal(), run: () => move_lane(-1) },
			{ id: 'go.top', title: 'Top of Lane', group: 'go', keys: 'cmd-up', when: () => !modal() && focus !== null, run: () => move(-Infinity) },
			{ id: 'go.end', title: 'End of Lane', group: 'go', keys: 'cmd-down', when: () => !modal() && focus !== null, run: () => move(Infinity) },
			{
				id: 'go.clear-focus',
				title: 'Clear Focus',
				group: 'go',
				keys: 'escape',
				when: () => !modal() && !palette_open && focus !== null && selected.size === 0,
				run: () => (focus = null)
			},
			{
				id: 'file.open',
				title: 'Open in Browser',
				group: 'file',
				keys: 'enter',
				also: ['cmd-o'],
				when: () => !modal() && focused() !== null,
				run: () => gh.link(focused()!).then(gh.open_url)
			},
			{
				id: 'file.open-repo',
				title: 'Open Repository',
				group: 'file',
				keys: 'shift-enter',
				when: () => !modal() && focused() !== null,
				run: () => gh.open_url(focused()!.repository.html_url)
			},
			{ id: 'file.copy-link', title: 'Copy Link', group: 'file', keys: 'shift-cmd-c', when: () => !modal() && focused() !== null, run: () => ask('copy') },
			{ id: 'notification.read', title: 'Mark as Read', group: 'notification', keys: 'r', when: () => !modal() && focused() !== null, run: () => ask('read') },
			{ id: 'notification.done', title: 'Mark as Done', group: 'notification', keys: 'e', when: () => !modal() && focused() !== null, run: () => ask('done') },
			{ id: 'notification.unsubscribe', title: 'Unsubscribe', group: 'notification', keys: 'u', when: () => !modal() && focused() !== null, run: () => ask('unsubscribe') },
			{
				id: 'notification.whiteboard',
				title: 'Open in Whiteboard',
				group: 'notification',
				keys: 'w',
				when: () => !modal() && focused()?.subject.type === 'PullRequest',
				run: () => (request = { action: 'whiteboard', list: [focused()!], seq: ++request_seq })
			},
			{ id: 'notification.comment', title: 'Comment…', group: 'notification', keys: 'c', when: () => !modal() && focused() !== null, run: () => ask('comment') },
			{
				id: 'notification.close',
				title: 'Close Pull Request or Issue…',
				group: 'notification',
				keys: 'shift-cmd-backspace',
				when: () => !modal() && focused() !== null,
				run: () => ask('close')
			},
			{ id: 'notification.menu', title: 'Show Actions', group: 'notification', keys: 'shift-f10', when: () => !modal() && focused() !== null, run: menu_at_focus },
			{
				id: 'view.sort-lane',
				title: 'Sort Lane Oldest / Newest First',
				group: 'view',
				keys: 'alt-cmd-s',
				when: () => focus !== null,
				run: () => flip(focus!.lane)
			},
			{ id: 'edit.palette', title: 'Command Palette…', group: 'edit', keys: 'cmd-k', run: () => (palette_open = !palette_open) },
			{ id: 'help.shortcuts', title: 'Keyboard Shortcuts', group: 'help', keys: 'cmd-/', run: () => (show_shortcuts = !show_shortcuts) },
			{ id: 'help.setup', title: 'Check gh Setup', group: 'help', run: onsetup },
			{ id: 'help.report', title: 'Report an Issue', group: 'help', run: () => gh.open_url('https://github.com/jaronoff97/gitbox/issues/new') },
			{ id: 'help.repo', title: 'Gitbox on GitHub', group: 'help', run: () => gh.open_url('https://github.com/jaronoff97/gitbox') }
		])
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

<div class="page" class:hidden={!active}>
	<div class="toolbar">
		<div class="titles">
			<div class="title">Inbox</div>
			<div class="subtitle">
				{items.length}{more ? '+' : ''} {settings.include_read ? 'notifications' : 'unread'}{loading ? ' · loading…' : ''}
			</div>
		</div>
		<div class="grow"></div>
		<FilterMenu {items} filters={settings.filters} onchange={filter} onopen={(open) => (filters_open = open)} />
		<Tooltip content={loading ? 'Refreshing…' : 'Refresh (⌘R)'} side="bottom">
			{#snippet children(hover)}
				<div class="tool" class:busy={loading} {...hover} hitbox="self" testId="refresh" tabindex={0} onclick={refresh}>
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
				onmenu={open_menu}
				{selected}
				onselect={select}
				onhover={() => (hover_lane = lane.key)}
				focused_id={focus?.lane === lane.key ? focus.id : null}
				onfocus={(n) => focus_at(lane, lane.cards.indexOf(n), false)}
				reveal={focus?.lane === lane.key ? reveal : 0}
				ongrow={() => !error && grow(lane.key)}
			/>
		{/each}
	</div>
</div>

<CardActions
	target={menu}
	{request}
	{selection}
	{progress}
	onclose={() => (menu = null)}
	onrun={run_action}
	onclear={() => (selected = new Set())}
	ondialog={(open) => (dialog = open)}
/>
<Toast {toasts} onopen={open_toast} lift={selection.length > 0 || progress !== null} />

{#if palette_open}
	<Palette
		{items}
		filters={settings.filters}
		lanes={lanes.map((l) => ({ key: l.key, title: l.title }))}
		onfilter={filter}
		onlane={(key) => focus_at(lanes.find((l) => l.key === key), 0)}
		onopen={(n) => gh.link(n).then(gh.open_url)}
		onfocus={(n) => {
			const lane = lanes.find((l) => l.cards.includes(n));
			focus_at(lane, lane?.cards.indexOf(n) ?? 0);
		}}
		onclose={() => (palette_open = false)}
	/>
{/if}

{#if show_shortcuts}
	<Shortcuts onclose={() => (show_shortcuts = false)} />
{/if}

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
	.page.hidden {
		visibility: hidden;
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
	.titles {
		display: flex;
		flex-direction: column;
	}
	.title {
		font-size: var(--text-title, 13px);
		font-weight: bold;
		color: var(--ink);
	}
	.subtitle {
		font-size: var(--text-xs, 11px);
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
		cursor: default;
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
