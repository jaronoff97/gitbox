<script lang="ts">
	import Portal from 'gpuix-svelte/components/Portal.svelte';

	/** Short messages at the bottom of the window; Board adds them and takes them away on a timer. */
	let { toasts }: { toasts: { id: number; text: string; error: boolean }[] } = $props();
</script>

{#if toasts.length}
	<Portal>
		<div class="stack">
			{#each toasts as t (t.id)}
				<div class="toast" class:error={t.error} testId="toast">{t.text}</div>
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
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		/* Messages only: clicks go to the board behind them. */
		pointer-events: none;
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
	.toast.error {
		border-color: var(--fail);
		color: var(--fail);
	}
</style>
