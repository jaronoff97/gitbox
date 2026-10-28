<script lang="ts">
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import {
		focus_element,
		focus_next_within,
		focus_previous_within,
		focused_element,
		on_window_key,
		type GpuixEvent,
		type ShadowNode
	} from 'gpuix-svelte';
	import pkg from '../package.json' with { type: 'json' };
	import { close } from './icons.ts';
	import { DEFAULTS, LANE_TITLES, move_lane, settings, toggle_lane, update, type Settings } from './settings.svelte.ts';
	import ShortcutList from './ShortcutList.svelte';
	import { state_file } from './store.ts';

	let { login, onclose, onsetup }: { login: string; onclose: () => void; onsetup: () => void } = $props();

	let dialog: ShadowNode | null = null;
	/** Where the focus was before the dialog opened; it goes back there when the dialog closes. */
	const before = focused_element();

	// Keyboard (#5): focus moves into the dialog (as it mounts, below) and Tab stays there. Escape closes it.
	$effect(() => {
		const off = on_window_key('keydown', (e: GpuixEvent) => {
			if (e.key === 'escape') onclose();
			// ⌘[ and ⌘]: the tab before or after.
			else if (e.modifiers?.cmd && (e.key === '[' || e.key === ']')) step_tab(e.key === '[' ? -1 : 1);
			else if (e.key === 'tab' && dialog) {
				e.preventDefault();
				(e.modifiers?.shift ? focus_previous_within : focus_next_within)(dialog);
			}
		});
		return () => {
			off();
			if (before) focus_element(before);
		};
	});

	const pressed = (e: GpuixEvent) => e.key === 'space' || e.key === 'enter';

	type Choice = 'lane_size' | 'batch' | 'refresh_minutes' | 'theme' | 'density' | 'text_size';
	type Value = Settings[Choice];

	/** Space or ↩ picks an option; ← and → move along the choice. */
	function choose(e: GpuixEvent, key: Choice, options: [Value, string][], value: Value) {
		const at = options.findIndex(([v]) => v === settings[key]);
		if (pressed(e)) update({ [key]: value });
		else if (e.key === 'left' && at > 0) update({ [key]: options[at - 1][0] });
		else if (e.key === 'right' && at < options.length - 1) update({ [key]: options[at + 1][0] });
	}

	// The tabs (#8); the dialog opens on the one last used.
	const TABS: [string, string][] = [
		['general', 'General'],
		['board', 'Board'],
		['appearance', 'Appearance'],
		['shortcuts', 'Shortcuts'],
		['advanced', 'Advanced']
	];
	let tab = $derived(TABS.some(([k]) => k === settings.tab) ? settings.tab : 'general');
	function step_tab(step: number) {
		const at = TABS.findIndex(([k]) => k === tab);
		update({ tab: TABS[(at + step + TABS.length) % TABS.length][0] });
	}

	/** A sort choice per lane, as #1's button in the lane header sets it. */
	const sort_of = (key: string) => settings.lane_sort[key] ?? 'desc';
	const set_sort = (key: string, sort: 'asc' | 'desc') => update({ lane_sort: { ...settings.lane_sort, [key]: sort } });
</script>

{#snippet choice(key: Choice, options: [Value, string][])}
	<div class="seg">
		{#each options as [value, label] (value)}
			<div
				class="opt"
				class:on={settings[key] === value}
				testId="{key}-{value}"
				tabindex={0}
				onclick={() => update({ [key]: value })}
				onkeydown={(e: GpuixEvent) => choose(e, key, options, value)}
			>
				{label}
			</div>
		{/each}
	</div>
{/snippet}

{#snippet switch_(on: boolean, flip: () => void, id: string)}
	<div
		class="switch"
		class:on
		hitbox="self"
		testId={id}
		tabindex={0}
		onclick={flip}
		onkeydown={(e: GpuixEvent) => pressed(e) && flip()}
	>
		<div class="knob" class:on></div>
	</div>
{/snippet}

{#snippet toggle(key: 'participating' | 'include_read' | 'single_keys')}
	{@render switch_(settings[key], () => update({ [key]: !settings[key] }), `toggle-${key}`)}
{/snippet}

{#snippet button(title: string, id: string, run: () => void)}
	<div class="btn" testId={id} tabindex={0} onclick={run} onkeydown={(e: GpuixEvent) => pressed(e) && run()}>{title}</div>
{/snippet}

{#snippet row(title: string, hint: string)}
	<div class="text">
		<div class="label">{title}</div>
		<div class="hint">{hint}</div>
	</div>
{/snippet}

<Portal>
	<div class="scrim" onclick={onclose}>
		<div
			class="dialog"
			testId="settings-dialog"
			onclick={() => {}}
			{@attach (node: ShadowNode) => {
				dialog = node;
				// Its children get native ids when this frame commits, so the focus moves in a tick later.
				setTimeout(() => focus_next_within(node));
			}}
		>
			<div class="head">
				<div class="title">Settings</div>
				<svg class="x" source={close} testId="settings-close" onclick={onclose}></svg>
			</div>

			<div class="tabs">
				{#each TABS as [key, label] (key)}
					<div
						class="tab"
						class:on={tab === key}
						testId="tab-{key}"
						tabindex={0}
						onclick={() => update({ tab: key })}
						onkeydown={(e: GpuixEvent) =>
							e.key === 'left' ? step_tab(-1) : e.key === 'right' ? step_tab(1) : pressed(e) && update({ tab: key })}
					>
						{label}
					</div>
				{/each}
			</div>

			{#if tab === 'general'}
				<div class="row">
					{@render row('Refresh', 'Fetch the board again on a timer.')}
					{@render choice('refresh_minutes', [
						[0, 'Off'],
						[1, '1 min'],
						[5, '5 min'],
						[15, '15 min']
					])}
				</div>
				<div class="row">
					{@render row('Include read', 'Also show notifications you have read, dimmed.')}
					{@render toggle('include_read')}
				</div>
				<div class="row">
					{@render row('Participating only', 'Threads you take part in: yours, mentions, assignments, review requests.')}
					{@render toggle('participating')}
				</div>
			{:else if tab === 'board'}
				<div class="row">
					{@render row('Cards per lane', 'What a lane shows at first, and adds when you scroll to its end.')}
					{@render choice('lane_size', [
						[25, '25'],
						[50, '50'],
						[100, '100']
					])}
				</div>
				<div class="section">Lanes, in board order</div>
				{#each settings.lanes as lane, i (lane.key)}
					<div class="row">
						{@render switch_(lane.shown, () => toggle_lane(lane.key), `lane-shown-${lane.key}`)}
						<div class="text">
							<div class="label" class:dim={!lane.shown}>{LANE_TITLES[lane.key] ?? lane.key}</div>
						</div>
						<div class="seg">
							{#each [['desc', 'Newest'], ['asc', 'Oldest']] as [sort, label] (sort)}
								<div
									class="opt"
									class:on={sort_of(lane.key) === sort}
									testId="lane-sort-{lane.key}-{sort}"
									tabindex={0}
									onclick={() => set_sort(lane.key, sort as 'asc' | 'desc')}
									onkeydown={(e: GpuixEvent) => pressed(e) && set_sort(lane.key, sort as 'asc' | 'desc')}
								>
									{label}
								</div>
							{/each}
						</div>
						<div class="moves">
							<div class="move" class:off={i === 0} testId="lane-up-{lane.key}" tabindex={0} onclick={() => move_lane(lane.key, -1)} onkeydown={(e: GpuixEvent) => pressed(e) && move_lane(lane.key, -1)}>↑</div>
							<div class="move" class:off={i === settings.lanes.length - 1} testId="lane-down-{lane.key}" tabindex={0} onclick={() => move_lane(lane.key, 1)} onkeydown={(e: GpuixEvent) => pressed(e) && move_lane(lane.key, 1)}>↓</div>
						</div>
					</div>
				{/each}
			{:else if tab === 'appearance'}
				<div class="row">
					{@render row('Theme', 'System follows macOS.')}
					{@render choice('theme', [
						['dark', 'Dark'],
						['light', 'Light'],
						['system', 'System']
					])}
				</div>
				<div class="row">
					{@render row('Density', 'Compact fits more cards in a lane.')}
					{@render choice('density', [
						['comfortable', 'Comfortable'],
						['compact', 'Compact']
					])}
				</div>
				<div class="row">
					{@render row('Text size', 'The board: cards, lane names and the toolbar.')}
					{@render choice('text_size', [
						[0.9, 'S'],
						[1, 'M'],
						[1.15, 'L'],
						[1.3, 'XL']
					])}
				</div>
			{:else if tab === 'shortcuts'}
				<div class="row">
					{@render row('Single-key shortcuts', 'j, k, e, r… with no modifier. Off leaves the ⌘ shortcuts, ↩ and ⎋.')}
					{@render toggle('single_keys')}
				</div>
				<div class="list"><ShortcutList /></div>
			{:else}
				<div class="row">
					{@render row('Pages fetched at once', 'More loads a big inbox faster, with more API calls at the same time.')}
					{@render choice('batch', [
						[1, '1'],
						[2, '2'],
						[4, '4'],
						[8, '8']
					])}
				</div>
				<div class="row">
					{@render row('GitHub host', 'For GitHub Enterprise (gh’s GH_HOST). Empty is github.com.')}
					<input
						class="field"
						value={settings.gh_host}
						placeholder="github.com"
						testId="gh-host"
						onchange={(e: GpuixEvent) => update({ gh_host: e.value ?? '' })}
					/>
				</div>
				<div class="row">
					{@render row('Path to gh', 'Empty finds gh on PATH, and in Homebrew’s folders.')}
					<input
						class="field"
						value={settings.gh_path}
						placeholder="gh"
						testId="gh-path"
						onchange={(e: GpuixEvent) => update({ gh_path: e.value ?? '' })}
					/>
				</div>
				<div class="row">
					{@render row('Account', login ? `Signed in as ${login} through the gh CLI.` : 'Signed in through the gh CLI.')}
					{@render button('Run setup again', 'settings-setup', onsetup)}
				</div>
				<div class="row">
					{@render row('Reset', 'Put every setting back to its default.')}
					{@render button('Reset', 'settings-reset', () => update({ ...DEFAULTS }))}
				</div>
			{/if}

			<div class="about">gitbox {pkg.version} · {state_file()}</div>
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
		align-items: center;
		justify-content: center;
		background-color: var(--scrim);
		/* GPUI scrolls every scroll container under the pointer; this hides the board from the wheel. */
		pointer-events: auto;
	}
	.dialog {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 560px;
		max-height: 92%;
		padding: 20px 24px;
		overflow-y: scroll;
		scrollbar-color: var(--thumb);
		border-radius: 14px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--surface);
	}
	.head {
		display: flex;
		align-items: center;
		padding-bottom: 4px;
	}
	.title {
		flex-grow: 1;
		font-size: 17px;
		font-weight: bold;
		color: var(--ink);
	}
	.x {
		width: 16px;
		height: 16px;
		color: var(--muted);
		cursor: pointer;
	}
	.x:hover {
		color: var(--ink);
	}
	.tabs {
		display: flex;
		gap: 4px;
		padding: 2px;
		margin-bottom: 6px;
		border-radius: 8px;
		background-color: var(--bg);
	}
	.tab {
		flex-grow: 1;
		padding: 5px 0px;
		border-radius: 6px;
		font-size: 12px;
		text-align: center;
		color: var(--muted);
		cursor: pointer;
	}
	.tab:hover {
		color: var(--ink);
	}
	.tab.on {
		background-color: var(--border);
		color: var(--ink);
	}
	.tab:focus-visible,
	.move:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
	}
	.dim {
		color: var(--muted);
	}
	.moves {
		display: flex;
		gap: 2px;
	}
	.move {
		width: 24px;
		padding: 3px 0px;
		border-radius: 5px;
		font-size: 12px;
		text-align: center;
		color: var(--ink);
		background-color: var(--border);
		cursor: pointer;
	}
	.move.off {
		opacity: 0.3;
	}
	.field {
		width: 220px;
		padding: 5px 8px;
		border-radius: 6px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--bg);
		font-size: 12px;
		color: var(--ink);
	}
	.list {
		padding-top: 10px;
	}
	.section {
		padding-top: 14px;
		padding-bottom: 2px;
		font-size: 11px;
		font-weight: semibold;
		color: var(--muted);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 16px;
		padding: 8px 0px;
		border-top-width: 1px;
		border-color: var(--border);
	}
	.text {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		flex-basis: 0;
		gap: 2px;
	}
	.label {
		color: var(--ink);
	}
	.hint {
		font-size: 12px;
		color: var(--muted);
	}
	.seg {
		display: flex;
		padding: 2px;
		border-radius: 8px;
		background-color: var(--bg);
	}
	.opt {
		padding: 4px 10px;
		border-radius: 6px;
		font-size: 12px;
		color: var(--muted);
		cursor: pointer;
	}
	.opt:hover {
		color: var(--ink);
	}
	.opt.on {
		background-color: var(--border);
		color: var(--ink);
	}
	.switch {
		display: flex;
		justify-content: flex-start;
		width: 34px;
		height: 20px;
		padding: 2px;
		border-radius: 10px;
		background-color: var(--border);
		cursor: pointer;
	}
	.switch.on {
		justify-content: flex-end;
		background-color: var(--accent);
	}
	.knob {
		width: 16px;
		height: 16px;
		border-radius: 8px;
		background-color: var(--ink);
	}
	.knob.on {
		background-color: var(--bg);
	}
	.btn {
		padding: 6px 12px;
		border-radius: 6px;
		font-size: 12px;
		background-color: var(--border);
		color: var(--ink);
		cursor: pointer;
	}
	.btn:hover {
		background-color: var(--thumb);
	}
	.opt:focus-visible,
	.switch:focus-visible,
	.btn:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
	}
	.about {
		padding-top: 14px;
		font-size: 11px;
		color: var(--muted);
	}
</style>
