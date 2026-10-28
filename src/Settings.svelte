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
	import { DEFAULTS, lane_shown, settings, toggle_lane, update } from './settings.svelte.ts';
	import { state_file } from './store.ts';

	let { login, onclose, onsetup }: { login: string; onclose: () => void; onsetup: () => void } = $props();

	let dialog: ShadowNode | null = null;
	/** Where the focus was before the dialog opened; it goes back there when the dialog closes. */
	const before = focused_element();

	// Keyboard (#5): focus moves into the dialog (as it mounts, below) and Tab stays there. Escape closes it.
	$effect(() => {
		const off = on_window_key('keydown', (e: GpuixEvent) => {
			if (e.key === 'escape') onclose();
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

	/** Space or ↩ picks an option; ← and → move along the choice. */
	function choose(e: GpuixEvent, key: 'lane_size' | 'batch' | 'refresh_minutes', options: [number, string][], value: number) {
		const at = options.findIndex(([v]) => v === settings[key]);
		if (pressed(e)) update({ [key]: value });
		else if (e.key === 'left' && at > 0) update({ [key]: options[at - 1][0] });
		else if (e.key === 'right' && at < options.length - 1) update({ [key]: options[at + 1][0] });
	}
</script>

{#snippet choice(key: 'lane_size' | 'batch' | 'refresh_minutes', options: [number, string][])}
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

{#snippet hide_lane(key: string)}
	<div
		class="switch"
		class:on={!lane_shown(key)}
		hitbox="self"
		testId="toggle-hide-{key}"
		tabindex={0}
		onclick={() => toggle_lane(key)}
		onkeydown={(e: GpuixEvent) => pressed(e) && toggle_lane(key)}
	>
		<div class="knob" class:on={!lane_shown(key)}></div>
	</div>
{/snippet}

{#snippet toggle(key: 'participating' | 'include_read')}
	<div
		class="switch"
		class:on={settings[key]}
		hitbox="self"
		testId="toggle-{key}"
		tabindex={0}
		onclick={() => update({ [key]: !settings[key] })}
		onkeydown={(e: GpuixEvent) => pressed(e) && update({ [key]: !settings[key] })}
	>
		<div class="knob" class:on={settings[key]}></div>
	</div>
{/snippet}

{#snippet row(title: string, hint: string)}
	<div class="text">
		<div class="label">{title}</div>
		<div class="hint">{hint}</div>
	</div>
{/snippet}

<Portal>
	<div class="scrim" onclick={onclose}>
		<div class="dialog" testId="settings-dialog" onclick={() => {}} {@attach (node: ShadowNode) => {
				dialog = node;
				// Its children get native ids when this frame commits, so the focus moves in a tick later.
				setTimeout(() => focus_next_within(node));
			}}>
			<div class="head">
				<div class="title">Settings</div>
				<svg class="x" source={close} testId="settings-close" onclick={onclose}></svg>
			</div>

			<div class="section">Board</div>
			<div class="row">
				{@render row('Cards per lane', 'What a lane shows at first, and adds when you scroll to its end.')}
				{@render choice('lane_size', [
					[25, '25'],
					[50, '50'],
					[100, '100']
				])}
			</div>
			<div class="row">
				{@render row('Hide Merged / Closed', 'Keep the board to open work.')}
				{@render hide_lane('done')}
			</div>

			<div class="section">Notifications</div>
			<div class="row">
				{@render row('Participating only', 'Threads you take part in: yours, mentions, assignments, review requests.')}
				{@render toggle('participating')}
			</div>
			<div class="row">
				{@render row('Include read', 'Also show notifications you have read, dimmed.')}
				{@render toggle('include_read')}
			</div>
			<div class="row">
				{@render row('Refresh', 'Fetch the board again on a timer.')}
				{@render choice('refresh_minutes', [
					[0, 'Off'],
					[1, '1 min'],
					[5, '5 min'],
					[15, '15 min']
				])}
			</div>

			<div class="section">Advanced</div>
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
				{@render row('Account', login ? `Signed in as ${login} through the gh CLI.` : 'Signed in through the gh CLI.')}
				<div class="btn" testId="settings-setup" tabindex={0} onclick={onsetup} onkeydown={(e: GpuixEvent) => pressed(e) && onsetup()}>Run setup again</div>
			</div>
			<div class="row">
				{@render row('Reset', 'Put every setting back to its default.')}
				<div
					class="btn"
					testId="settings-reset"
					tabindex={0}
					onclick={() => update({ ...DEFAULTS })}
					onkeydown={(e: GpuixEvent) => pressed(e) && update({ ...DEFAULTS })}
				>Reset</div>
			</div>

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
