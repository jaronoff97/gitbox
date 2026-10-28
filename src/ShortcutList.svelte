<script lang="ts">
	import { caps, commands, GROUPS } from './commands.svelte.ts';

	/** Every command that has keys, by menu, as the registry has them (#4): the ⌘/ overlay and
	 * Settings → Shortcuts both show this. */
	let groups = $derived(
		GROUPS.map((g) => ({ ...g, list: commands().filter((c) => c.group === g.key && c.keys) })).filter((g) => g.list.length)
	);
</script>

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

<style>
	.columns {
		display: flex;
		flex-wrap: wrap;
		gap: 18px 28px;
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 4px;
		width: 290px;
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
