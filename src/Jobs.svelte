<script lang="ts">
	import Portal from 'gpuix-svelte/components/Portal.svelte';
	import { jobs } from './jobs.svelte.ts';
</script>

<!-- The progress popup: each background job (src/jobs.svelte.ts) while it runs, in the top-right
     corner under the toolbar, from any tab. -->
{#if jobs.list.length}
	<Portal>
		<div class="corner">
			{#each jobs.list as job, i (i)}
				<div class="job" testId="job">
					<div class="title">{job.title}</div>
					<div class="detail">{job.detail || 'Starting…'}{job.total ? ` · ${job.done} of ${job.total}` : ''}</div>
					{#if job.total}
						<div class="track">
							<div class="fill" style="width: {Math.round((100 * job.done) / job.total)}%"></div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</Portal>
{/if}

<style>
	.corner {
		position: absolute;
		top: 60px;
		right: 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		width: 260px;
		/* It only reports; clicks go through to the lane under it. */
		pointer-events: none;
	}
	.job {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 9px 12px;
		border-radius: 9px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--raised);
		pointer-events: none;
	}
	.title {
		font-size: var(--text-sm, 12px);
		font-weight: semibold;
		color: var(--ink);
	}
	.detail {
		font-size: var(--text-xs, 11px);
		color: var(--muted);
		white-space: nowrap;
		text-overflow: ellipsis;
		overflow: hidden;
	}
	.track {
		height: 4px;
		margin-top: 2px;
		border-radius: 2px;
		background-color: var(--border);
	}
	.fill {
		height: 4px;
		border-radius: 2px;
		background-color: var(--accent);
	}
</style>
