<script lang="ts">
	import { checks } from './gh.ts';

	let { ondone }: { ondone: () => void } = $props();

	type Status = { state: 'wait' | 'run' | 'ok' | 'fail'; detail: string };
	let status = $state<Status[]>(checks.map(() => ({ state: 'wait', detail: '' })));
	let ready = $derived(status.every((s) => s.state === 'ok'));
	let busy = $derived(status.some((s) => s.state === 'run'));

	// Steps run in order; a failed step stops the rest, since each needs the one before.
	async function run() {
		status = checks.map(() => ({ state: 'wait', detail: '' }));
		for (const [i, check] of checks.entries()) {
			status[i] = { state: 'run', detail: '' };
			try {
				status[i] = { state: 'ok', detail: await check.run() };
			} catch (e) {
				status[i] = { state: 'fail', detail: (e as Error).message };
				return;
			}
		}
	}

	run();

	const icon = { wait: '○', run: '…', ok: '✓', fail: '✕' };
</script>

<div class="card">
	<div class="mark">
		{#each ['muted', 'warn', 'accent', 'merged'] as tone (tone)}<div class="bar" style="background-color: var(--{tone})"></div>{/each}
	</div>
	<div class="title">Welcome to gitbox</div>
	<div class="sub">gitbox reads your GitHub notifications through the gh CLI. Checking your setup:</div>

	{#each checks as check, i}
		{@const s = status[i]}
		<div class="step">
			<div class="icon {s.state}">{icon[s.state]}</div>
			<div class="body">
				<div class="label">{check.label}</div>
				{#if s.detail}<div class="detail {s.state}">{s.detail}</div>{/if}
				{#if s.state === 'fail'}<div class="hint" testId="hint">{check.hint}</div>{/if}
			</div>
		</div>
	{/each}

	<div class="actions">
		{#if ready}
			<div class="btn primary" testId="continue" tabindex={0} onclick={ondone}>Show notifications</div>
		{:else if !busy}
			<div class="btn" testId="retry" tabindex={0} onclick={run}>Check again</div>
		{/if}
	</div>
</div>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 14px;
		width: 460px;
		padding: 28px;
		border-radius: 12px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--surface);
	}
	.mark {
		display: flex;
		gap: 4px;
		height: 28px;
	}
	.bar {
		width: 7px;
		height: 28px;
		border-radius: 3px;
	}
	.title {
		font-size: 22px;
		font-weight: bold;
		color: var(--ink);
	}
	.sub {
		color: var(--muted);
	}
	.step {
		display: flex;
		gap: 12px;
	}
	.icon {
		width: 20px;
		font-weight: bold;
		color: var(--muted);
	}
	.icon.ok {
		color: var(--ok);
	}
	.icon.fail {
		color: var(--fail);
	}
	.icon.run {
		color: var(--accent);
	}
	.body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex-grow: 1;
	}
	.label {
		color: var(--ink);
	}
	.detail {
		font-size: 12px;
		color: var(--muted);
	}
	.detail.fail {
		color: var(--fail);
	}
	.hint {
		font-size: 12px;
		color: var(--accent);
	}
	.actions {
		display: flex;
		justify-content: flex-end;
	}
	.btn {
		padding: 8px 16px;
		border-radius: 8px;
		background-color: var(--border);
		color: var(--ink);
		cursor: pointer;
	}
	.btn.primary {
		background-color: var(--ok);
		color: var(--bg);
		font-weight: bold;
	}
	.btn:hover {
		opacity: 0.85;
	}
	.btn:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
	}
</style>
