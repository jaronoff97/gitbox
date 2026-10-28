<script lang="ts">
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import { on_window_key } from 'gpuix-svelte';
	import { caps, commands, GROUPS } from './commands.svelte.ts';
	import { close } from './icons.ts';

	/** ⌘/: every command that has keys, by menu, as the registry has them (#4). */
	let { onclose }: { onclose: () => void } = $props();

	let groups = $derived(
		GROUPS.map((g) => ({ ...g, list: commands().filter((c) => c.group === g.key && c.keys) })).filter((g) => g.list.length)
	);

	// A dialog's own key: Escape closes it (⌘/ toggles it through its command).
	$effect(() => on_window_key('keydown', (e) => e.key === 'escape' && onclose()));
</script>

<Portal>
	<div class="scrim" onclick={onclose}>
		<div class="dialog" testId="shortcuts" onclick={() => {}}>
			<div class="head">
				<div class="title">Keyboard Shortcuts</div>
				<svg class="x" source={close} onclick={onclose}></svg>
			</div>
			<div class="columns">
				{#each groups as g (g.key)}
					<div class="group">
						<div class="group-title">{g.title}</div>
						{#each g.list as c (c.id)}
							<div class="row">
								<div class="name">{c.title}</div>
								<div class="caps">
									{#each caps(c.keys!) as cap, i (i)}<div class="cap">{cap}</div>{/each}
								</div>
							</div>
						{/each}
					</div>
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
		align-items: center;
		justify-content: center;
		background-color: var(--scrim);
		/* GPUI scrolls every scroll container under the pointer; this hides the board from the wheel. */
		pointer-events: auto;
	}
	.dialog {
		display: flex;
		flex-direction: column;
		gap: 12px;
		width: 720px;
		max-height: 90%;
		padding: 20px 24px;
		border-radius: 14px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--surface);
		overflow-y: scroll;
		scrollbar-color: var(--thumb);
	}
	.head {
		display: flex;
		align-items: center;
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
	.columns {
		display: flex;
		flex-wrap: wrap;
		gap: 18px 28px;
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 320px;
	}
	.group-title {
		padding-bottom: 2px;
		font-size: 11px;
		font-weight: semibold;
		color: var(--muted);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 3px 0px;
	}
	.name {
		flex-grow: 1;
		font-size: 13px;
		color: var(--ink);
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
</style>
