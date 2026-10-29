<script lang="ts">
	import Portal from 'gpuix-svelte/components/Portal.svelte';

	type Toast = { id: number; text: string; error: boolean; open?: () => void; action?: string };

	/** Short messages at the bottom of the window; Board adds them and takes them away on a timer. One
	 * that can open what its action touched shows ⌘↩ and takes a click. */
	/** `lift` raises the stack over the selection bar (#3). */
	let { toasts, onopen, lift = false }: { toasts: Toast[]; onopen: (t: Toast) => void; lift?: boolean } = $props();
</script>

{#if toasts.length}
	<Portal>
		<div class="stack" class:lift>
			{#each toasts as t (t.id)}
				{#if t.open}
					<div class="toast action" hitbox="self" testId="toast-open" onclick={() => onopen(t)}>
						<div>{t.text}</div>
						<div class="open">
							<div class="key">⌘↩</div>
							<div>{t.action ?? 'Open'}</div>
						</div>
					</div>
				{:else}
					<div class="toast" class:error={t.error} testId="toast">{t.text}</div>
				{/if}
			{/each}
		</div>
	</Portal>
{/if}

<style>
	.stack {
		position: absolute;
		left: 0px;
		bottom: 20px;
		width: 100%;
		/* Centred over the board, beside the sidebar (App sets its width). */
		padding-left: var(--sidebar, 0px);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		/* Messages only: clicks go to the board behind them. */
		pointer-events: none;
	}
	.stack.lift {
		bottom: 76px;
	}
	.toast {
		max-width: 560px;
		padding: 9px 14px;
		border-radius: 9px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--raised);
		font-size: 13px;
		color: var(--ink);
	}
	.toast.action {
		display: flex;
		align-items: center;
		gap: 14px;
		/* Unlike a plain message, this one takes clicks. */
		pointer-events: auto;
		cursor: pointer;
	}
	.toast.action:hover {
		border-color: var(--accent);
	}
	.open {
		display: flex;
		align-items: center;
		gap: 6px;
		color: var(--accent);
	}
	.key {
		padding: 1px 6px;
		border-radius: 5px;
		border-width: 1px;
		border-color: var(--border);
		font-size: 11px;
		color: var(--muted);
	}
	.toast.error {
		border-color: var(--fail);
		color: var(--fail);
	}
</style>
