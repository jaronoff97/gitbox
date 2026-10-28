<script lang="ts">
	import Popover from 'gpuix-svelte/components/Popover.svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import type { GpuixEvent } from 'gpuix-svelte';
	import { automations, describe, put, remove, STEPS, type Automation, type Step } from './automations.svelte.ts';
	import { FIELDS, field, type Field } from './filters.ts';
	import { ago } from './ago.ts';
	import { open_url } from './gh.ts';
	import { chevron, close, plus } from './icons.ts';

	/** The values a field has on GitHub, offered under its condition; the rest are typed. */
	const SUGGEST: Partial<Record<Field, string[]>> = {
		reason: ['review requested', 'mention', 'team mention', 'assign', 'author', 'comment', 'subscribed', 'state change', 'ci activity'],
		type: ['pull request', 'issue', 'release', 'discussion'],
		state: ['open', 'draft', 'closed', 'merged'],
		review: ['none', 'commented', 'approved', 'changes requested'],
		reviews: ['0', '1', '2', '3+']
	};
	const PLACEHOLDER: Partial<Record<Field, string>> = { repo: 'owner/name', org: 'tero', author: 'login', label: 'bug' };

	/** The automation being edited, a copy until Save; null shows the list's hint. */
	let draft = $state<Automation | null>(null);
	/** The condition whose field menu is open. */
	let picking = $state<number | null>(null);
	let problem = $state('');

	const is_new = $derived(draft !== null && !automations.list.some((a) => a.id === draft!.id));
	const pressed = (e: GpuixEvent) => e.key === 'space' || e.key === 'enter';

	function edit(a: Automation | null) {
		draft = a ? $state.snapshot(a) : null;
		problem = '';
	}

	function create() {
		edit({
			id: crypto.randomUUID(),
			name: '',
			enabled: true,
			when: [{ field: 'reason', value: 'review requested' }],
			then: ['approve'],
			created: new Date().toISOString()
		});
	}

	function toggle_step(step: Step) {
		const on = draft!.then.includes(step);
		// Kept in STEPS' order: approve before done, as done takes the thread out of the inbox.
		draft!.then = STEPS.map((s) => s.key).filter((k) => (k === step ? !on : draft!.then.includes(k)));
	}

	function submit() {
		const a = { ...draft!, name: draft!.name.trim(), when: draft!.when.filter((f) => f.value.trim()) };
		if (!a.when.length) return void (problem = 'Add a condition: an automation with none would act on everything.');
		if (!a.then.length) return void (problem = 'Pick a step for it to take.');
		put(a);
		edit(null);
	}

	const name_of = (id: string) => automations.list.find((a) => a.id === id)?.name || 'Untitled';
</script>

{#snippet switch_(on: boolean, flip: () => void, id: string)}
	<div class="switch" class:on hitbox="self" testId={id} tabindex={0} onclick={flip} onkeydown={(e: GpuixEvent) => pressed(e) && flip()}>
		<div class="knob" class:on></div>
	</div>
{/snippet}

{#snippet button(title: string, id: string, run: () => void, tone = '')}
	<div class="btn {tone}" hitbox="self" testId={id} tabindex={0} onclick={run} onkeydown={(e: GpuixEvent) => pressed(e) && run()}>
		{title}
	</div>
{/snippet}

<div class="page">
	<div class="header">
		<div class="titles">
			<div class="title">Automations</div>
			<div class="subtitle">Checked every minute against your newest unread notifications</div>
		</div>
		<div class="grow"></div>
		<div class="btn primary" hitbox="self" testId="new-automation" tabindex={0} onclick={create} onkeydown={(e: GpuixEvent) => pressed(e) && create()}>
			<svg class="icon" source={plus}></svg>
			<div>New automation</div>
		</div>
	</div>

	<div class="body">
		<div class="side">
			<Scroller pad="12px" gap={6}>
				{#each automations.list as a (a.id)}
					<div class="item" class:on={draft?.id === a.id} hitbox="self" testId="automation-{a.id}" onclick={() => edit(a)}>
						<div class="text">
							<div class="label" class:dim={!a.enabled}>{a.name || 'Untitled'}</div>
							<div class="hint">{describe(a)}</div>
						</div>
						{@render switch_(a.enabled, () => put({ ...a, enabled: !a.enabled }), `automation-on-${a.id}`)}
					</div>
				{:else}
					<div class="hint pad">No automations yet. Make one to approve, read or clear notifications as they arrive.</div>
				{/each}

				<div class="section">Activity</div>
				{#each automations.log.slice(0, 30) as r (r.at + r.automation + r.thread)}
					<div class="run" hitbox="self" onclick={() => r.url && open_url(r.url)}>
						<div class="dot" class:fail={!!r.error}></div>
						<div class="text">
							<div class="label">{r.title}</div>
							<div class="hint" class:fail={!!r.error}>{name_of(r.automation)} · {r.error ?? 'done'} · {ago(r.at)}</div>
						</div>
					</div>
				{:else}
					<div class="hint pad">Nothing yet.</div>
				{/each}
			</Scroller>
		</div>

		<div class="editor">
			{#if draft}
				<Scroller pad="20px 24px" gap={10}>
					<input
						class="field name"
						value={draft.name}
						placeholder="Name, such as Approve the team's PRs"
						testId="automation-name"
						onchange={(e: GpuixEvent) => (draft!.name = e.value ?? '')}
					/>

					<div class="section">When a notification matches</div>
					{#each draft.when as c, i (i)}
						<div class="cond">
							<Popover open={picking === i} onclose={() => (picking = null)} testid="field-menu" style="padding: 6px">
								<div class="pick" hitbox="self" testId="cond-field-{i}" tabindex={0} onclick={() => (picking = picking === i ? null : i)}>
									<div>{field(c.field).title}</div>
									<svg class="chev" source={chevron}></svg>
								</div>
								{#snippet content()}
									<div class="menu">
										{#each FIELDS as f (f.key)}
											<div
												class="menu-item"
												testId="cond-pick-{f.key}"
												onclick={() => {
													draft!.when[i] = { field: f.key, value: '' };
													picking = null;
												}}
											>
												{f.title}
											</div>
										{/each}
									</div>
								{/snippet}
							</Popover>
							<div class="is">is</div>
							<input
								class="field grow"
								value={c.value}
								placeholder={PLACEHOLDER[c.field] ?? SUGGEST[c.field]?.[0] ?? ''}
								testId="cond-value-{i}"
								onchange={(e: GpuixEvent) => (draft!.when[i].value = e.value ?? '')}
							/>
							<svg class="x" source={close} testId="cond-remove-{i}" onclick={() => draft!.when.splice(i, 1)}></svg>
						</div>
						{#if SUGGEST[c.field]}
							<div class="chips">
								{#each SUGGEST[c.field]! as v (v)}
									<div class="chip" class:on={c.value === v} testId="cond-suggest-{i}-{v}" onclick={() => (draft!.when[i].value = v)}>{v}</div>
								{/each}
							</div>
						{/if}
					{/each}
					<div class="row-start">
						{@render button('Add condition', 'add-condition', () => draft!.when.push({ field: 'author', value: '' }))}
					</div>
					<div class="hint">Several values of one field match any of them; different fields must all match.</div>

					<div class="section">Then</div>
					{#each STEPS as s (s.key)}
						<div class="step">
							{@render switch_(draft.then.includes(s.key), () => toggle_step(s.key), `step-${s.key}`)}
							<div class="label">{s.title}</div>
						</div>
					{/each}

					<div class="step">
						{@render switch_(draft.enabled, () => (draft!.enabled = !draft!.enabled), 'automation-enabled')}
						<div class="label">On</div>
					</div>
					<div class="hint">It acts on notifications that arrive after you make it, once per thread.</div>

					{#if problem}<div class="hint fail">{problem}</div>{/if}
					<div class="actions">
						{@render button(is_new ? 'Create' : 'Save', 'automation-save', submit, 'primary')}
						{@render button('Cancel', 'automation-cancel', () => edit(null))}
						<div class="grow"></div>
						{#if !is_new}
							{@render button('Delete', 'automation-delete', () => (remove(draft!.id), edit(null)), 'danger')}
						{/if}
					</div>
				</Scroller>
			{:else}
				<div class="empty">
					<div class="hint">Pick an automation to change it, or make a new one.</div>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		width: 100%;
		height: 100%;
		font-size: var(--text-md, 13px);
		color: var(--ink);
	}
	.header {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 52px;
		flex-shrink: 0;
		padding: 0px 14px 0px 16px;
		border-bottom-width: 1px;
		border-color: var(--separator);
		background-color: var(--toolbar);
		user-select: none;
	}
	.titles {
		display: flex;
		flex-direction: column;
	}
	.title {
		font-size: var(--text-title, 13px);
		font-weight: bold;
	}
	.subtitle {
		font-size: var(--text-xs, 11px);
		color: var(--muted);
	}
	.grow {
		flex-grow: 1;
	}
	.body {
		display: flex;
		flex-grow: 1;
		flex-basis: 0;
		min-height: 0;
	}
	.side {
		display: flex;
		flex-direction: column;
		width: 340px;
		flex-shrink: 0;
		border-right-width: 1px;
		border-color: var(--separator);
		background-color: var(--lane);
	}
	.editor {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		flex-basis: 0;
		min-width: 0;
	}
	.empty {
		display: flex;
		flex-grow: 1;
		align-items: center;
		justify-content: center;
	}
	.item,
	.run {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 8px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--surface);
		cursor: pointer;
	}
	.item:hover,
	.run:hover {
		background-color: var(--raised);
	}
	.item.on {
		border-color: var(--accent);
	}
	.run {
		padding: 6px 10px;
		border-color: var(--lane);
		background-color: var(--lane);
	}
	.dot {
		width: 8px;
		height: 8px;
		flex-shrink: 0;
		border-radius: 4px;
		background-color: var(--ok);
	}
	.dot.fail {
		background-color: var(--fail);
	}
	.text {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		flex-basis: 0;
		min-width: 0;
		gap: 2px;
	}
	.label {
		color: var(--ink);
	}
	.dim {
		color: var(--muted);
	}
	.hint {
		font-size: var(--text-sm, 12px);
		color: var(--muted);
	}
	.hint.fail {
		color: var(--fail);
	}
	.pad {
		padding: 4px 2px;
	}
	.section {
		padding-top: 12px;
		font-size: var(--text-xs, 11px);
		font-weight: semibold;
		color: var(--muted);
	}
	.field {
		padding: 6px 8px;
		border-radius: 6px;
		border-width: 1px;
		border-color: var(--border);
		background-color: var(--bg);
		font-size: var(--text-md, 13px);
		color: var(--ink);
	}
	.field.name {
		font-size: 15px;
		font-weight: semibold;
	}
	.cond,
	.step,
	.actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.actions {
		padding-top: 10px;
	}
	.row-start {
		display: flex;
	}
	.pick {
		display: flex;
		align-items: center;
		gap: 6px;
		justify-content: space-between;
		width: 150px;
		padding: 6px 8px;
		border-radius: 6px;
		background-color: var(--surface);
		cursor: pointer;
	}
	.pick:hover {
		background-color: var(--border);
	}
	.chev {
		width: 12px;
		height: 12px;
		color: var(--muted);
	}
	.is {
		color: var(--muted);
	}
	.x {
		width: 14px;
		height: 14px;
		color: var(--muted);
		cursor: pointer;
	}
	.x:hover {
		color: var(--ink);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding-left: 160px;
	}
	.chip {
		padding: 2px 8px;
		border-radius: 10px;
		font-size: var(--text-xs, 11px);
		background-color: var(--surface);
		color: var(--muted);
		cursor: pointer;
	}
	.chip:hover {
		color: var(--ink);
	}
	.chip.on {
		background-color: var(--accent);
		color: var(--bg);
	}
	.menu {
		display: flex;
		flex-direction: column;
		width: 180px;
	}
	.menu-item {
		padding: 6px 8px;
		border-radius: 5px;
		cursor: pointer;
	}
	.menu-item:hover {
		background-color: var(--border);
	}
	.icon {
		width: 14px;
		height: 14px;
	}
	.btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 6px 12px;
		border-radius: 6px;
		font-size: var(--text-sm, 12px);
		background-color: var(--border);
		color: var(--ink);
		cursor: pointer;
	}
	.btn:hover {
		background-color: var(--thumb);
	}
	.btn.primary {
		background-color: var(--accent);
		color: var(--bg);
	}
	.btn.danger {
		color: var(--fail);
	}
	.switch {
		display: flex;
		justify-content: flex-start;
		width: 34px;
		height: 20px;
		flex-shrink: 0;
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
	.btn:focus-visible,
	.switch:focus-visible,
	.pick:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
	}
</style>
