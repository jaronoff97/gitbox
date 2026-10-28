<script lang="ts">
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import { get_native, type GpuixEvent, type ShadowNode } from 'gpuix-svelte';
	import Card from './Card.svelte';
	import type { Notification } from './gh.ts';

	let {
		key,
		title,
		tone,
		cards,
		badge,
		status,
		reset,
		ongrow
	}: {
		key: string;
		title: string;
		tone: string;
		cards: Notification[];
		badge: string;
		/** The end marker's text: "Loading…", "Scroll for more", "All caught up". */
		status: string;
		/** Changes when the board starts its lanes over (a filter, a refresh): back to the top. */
		reset: number;
		/** Called when you scroll to the end: the board shows more cards here if it has them. */
		ongrow: () => void;
	} = $props();

	// The lane is a windowed <virtual-list>: GPUI lays out and paints only the rows near the viewport,
	// and Svelte keeps only a window of WINDOW rows around them, moved as `onvisiblerange` reports.
	// Row `cards.length` is the end marker.
	const WINDOW = 40;
	const OVERSCAN = 15;
	const ESTIMATE = 130;

	let count = $derived(cards.length + 1);
	let start = $state(0);
	let end = $state(WINDOW);
	// Clamped, so a lane that shrank (a filter, a refresh) still mounts rows it has.
	let from = $derived(Math.min(start, Math.max(0, count - WINDOW)));
	let to = $derived(Math.min(count, Math.max(end, from + WINDOW)));
	let rows = $derived(Array.from({ length: to - from }, (_, k) => from + k));

	let last_visible = 0;
	/** When you last scrolled this lane yourself, by wheel or by the strip. */
	let touched_at = 0;
	let list: ShadowNode | null = null;
	let box: ShadowNode | null = null;
	let dragging = $state(false);

	const at_end = () => last_visible >= count - 2;

	$effect(() => {
		void reset;
		start = 0;
		end = WINDOW;
		last_visible = 0;
		const native = get_native();
		if (native && list?.nativeId != null) native.scrollToItem(list.nativeId, 0, 0);
	});

	function on_range(e: GpuixEvent) {
		const first = e.startIndex ?? 0;
		last_visible = e.endIndex ?? 0;
		if ((first < from + 5 && from > 0) || (last_visible > to - 5 && to < count)) {
			start = Math.max(0, first - OVERSCAN);
			end = Math.min(count, last_visible + OVERSCAN);
		}
		// The end came into view by your own scroll (its range can land after a drag's release); a lane
		// that is merely short stays as it is.
		if (at_end() && Date.now() - touched_at < 1000) ongrow();
	}

	// `scroll` is wheel input (negative is down). A short lane has no range change to report, so the
	// wheel itself asks for more once the end is in view.
	function on_wheel(e: GpuixEvent) {
		if ((e.deltaY ?? 0) >= 0) return;
		touched_at = Date.now();
		if (at_end()) ongrow();
	}

	// GPUI paints the thumb (scrollbar-color) in the same frame as the scroll, but it can't be dragged,
	// so a strip over it takes the mouse and scrolls to the row at that height. A move with no button
	// held is a release that landed elsewhere, as GPUI doesn't capture the pointer.
	function scroll_to(y: number) {
		const native = get_native();
		const b = box?.nativeId == null ? null : native?.getElementBounds(box.nativeId);
		if (!native || !b || list?.nativeId == null) return;
		const at = Math.max(0, Math.min(0.9999, (y - b.y) / b.height)) * count;
		const row = Math.floor(at);
		touched_at = Date.now();
		// GPUI reports no visible range after a scrollToItem, so a jump does what a range event would:
		// it moves the window to its target first (scrollToItem applies after that commit's rows are
		// in), and grows the lane when it lands on the end.
		start = Math.max(0, row - OVERSCAN);
		end = Math.min(count, row + WINDOW - OVERSCAN);
		last_visible = Math.min(count, row + 1);
		native.scrollToItem(list.nativeId, row, (at % 1) * ESTIMATE);
		if (at_end()) ongrow();
	}

	function press(e: GpuixEvent) {
		if (e.button !== 0) return;
		dragging = true;
		scroll_to(e.y ?? 0);
	}

	function drag_to(e: GpuixEvent) {
		if (e.pressedButton == null) dragging = false;
		else scroll_to(e.y ?? 0);
	}
</script>

<div class="lane" testId="lane-{key}" onscroll={on_wheel}>
	<div class="head">
		<div class="dot" style="background-color: var(--{tone})"></div>
		<div class="title">{title}</div>
		<div class="badge">{badge}</div>
	</div>
	<div class="box" {@attach (node: ShadowNode) => (box = node)}>
		<virtual-list
			class="list"
			testId="list-{key}"
			itemCount={count}
			windowStart={from}
			estimatedItemHeight={ESTIMATE}
			onvisiblerange={on_range}
			{@attach (node: ShadowNode) => (list = node)}
		>
			{#each rows as i (i < cards.length ? cards[i].id : 'end')}
				<div class="row">
					{#if i < cards.length}
						<Card n={cards[i]} />
					{:else}
						<div class="end">{status}</div>
					{/if}
				</div>
			{/each}
		</virtual-list>
		<div class="gutter" testId="gutter-{key}" onmousedown={press}></div>
	</div>
</div>

{#if dragging}
	<Portal>
		<div class="overlay" onmousemove={drag_to} onmouseup={() => (dragging = false)}></div>
	</Portal>
{/if}

<style>
	.lane {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		flex-basis: 0;
		min-width: 0;
		gap: 10px;
		padding: 12px 4px 0px 10px;
		border-radius: 12px 12px 0px 0px;
		background-color: var(--lane);
	}
	.head {
		user-select: none;
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 0px 2px;
	}
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 4px;
	}
	.title {
		font-size: 13px;
		font-weight: semibold;
		color: var(--ink);
	}
	.badge {
		padding: 0px 7px;
		border-radius: 9px;
		font-size: 11px;
		color: var(--muted);
		background-color: var(--surface);
	}
	.box {
		position: relative;
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		flex-basis: 0;
		min-height: 0;
	}
	.list {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		min-height: 0;
		scrollbar-color: var(--thumb);
		scrollbar-width: 6px;
	}
	.row {
		width: 100%;
		padding: 0px 12px 8px 0px;
	}
	.gutter {
		position: absolute;
		top: 0px;
		right: 0px;
		bottom: 0px;
		width: 10px;
		cursor: default;
		user-select: none;
	}
	.overlay {
		position: absolute;
		top: 0px;
		left: 0px;
		width: 100%;
		height: 100%;
		user-select: none;
	}
	.end {
		padding: 10px 0px 14px 0px;
		font-size: 12px;
		text-align: center;
		color: var(--muted);
	}
</style>
