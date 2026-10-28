<script lang="ts">
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import { on_window_key } from 'gpuix-svelte';
	import ShortcutList from './ShortcutList.svelte';
	import { close } from './icons.ts';

	/** ⌘/: every command that has keys, by menu, as the registry has them (#4). */
	let { onclose }: { onclose: () => void } = $props();

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
			<ShortcutList />
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
</style>
