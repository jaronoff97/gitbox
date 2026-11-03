<script lang="ts">
	import Popover from 'gpuix-svelte/components/Popover.svelte';
	import Scroller from 'gpuix-svelte/components/Scroller.svelte';
	import type { GpuixEvent } from 'gpuix-svelte';
	import { automations, describe, notify_only, put, remove, STEPS, type Automation, type Step } from './automations.svelte.ts';
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
	/** The activity's runs on show: the newest PAGE, and PAGE more as a scroll reaches the end. The
	 * runs a launch's check only marked as seen stay out. */
	const PAGE = 25;
	let shown = $state(PAGE);
	let touched_at = 0;
	const runs = $derived(automations.log.filter((r) => !r.quiet));
	type Row =
		| { kind: 'automation'; key: string; a: Automation }
		| { kind: 'none' | 'section' | 'empty'; key: string }
		| { kind: 'run'; key: string; r: (typeof automations.log)[number] };
	const rows: Row[] = $derived([
		...(automations.list.length
			? automations.list.map((a): Row => ({ kind: 'automation', key: `a:${a.id}`, a }))
			: [{ kind: 'none', key: 'none' } as Row]),
		{ kind: 'section', key: 'section' },
		...(runs.length
			? runs.slice(0, shown).map((r): Row => ({ kind: 'run', key: `r:${r.at}:${r.automation}:${r.thread}`, r }))
			: [{ kind: 'empty', key: 'empty' } as Row])
	]);
	/** The end came into view by your own scroll: PAGE more runs. A short list stays as it is. */
	function on_range(e: GpuixEvent) {
		if ((e.endIndex ?? 0) >= rows.length - 3 && shown < runs.length && Date.now() - touched_at < 1000) shown += PAGE;
	}

	/** The notification step's Group by menu is open. */
	let picking_group = $state(false);

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
		// A notification alone may go to everything; any other step needs a condition.
		if (!a.when.length && !notify_only(a)) return void (problem = 'Add a condition: an automation with none would act on everything. Only a notification can go to every notification.');
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
		<!-- A windowed list, as a lane is: GPUI paints only the rows near the view, and the activity
		     shows its newest PAGE runs, PAGE more each time your own scroll reaches its end. -->
		<div class="side" testId="automation-side" onscroll={() => (touched_at = Date.now())}>
			<virtual-list class="side-list" testId="automation-list" itemCount={rows.length} estimatedItemHeight={56} onvisiblerange={on_range}>
				{#each rows as row (row.key)}
					<div class="row">
						{#if row.kind === 'automation'}
							{@const a = row.a}
							<div class="item" class:on={draft?.id === a.id} hitbox="self" testId="automation-{a.id}" onclick={() => edit(a)}>
								<div class="text">
									<div class="label" class:dim={!a.enabled}>{a.name || 'Untitled'}</div>
									<div class="hint">{describe(a)}</div>
								</div>
								{@render switch_(a.enabled, () => put({ ...a, enabled: !a.enabled }), `automation-on-${a.id}`)}
							</div>
						{:else if row.kind === 'none'}
							<div class="hint pad">No automations yet. Make one to approve, read or clear notifications as they arrive.</div>
						{:else if row.kind === 'section'}
							<div class="section">Activity</div>
						{:else if row.kind === 'run'}
							{@const r = row.r}
							<div class="run" hitbox="self" testId="run" onclick={() => r.url && open_url(r.url)}>
								<div class="dot" class:fail={!!r.error}></div>
								<div class="text">
									<div class="label">{r.title}</div>
									<div class="hint" class:fail={!!r.error}>{name_of(r.automation)} · {r.error ?? 'done'} · {ago(r.at)}</div>
								</div>
							</div>
						{:else}
							<div class="hint pad">Nothing yet.</div>
						{/if}
					</div>
				{/each}
			</virtual-list>
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
						{#if s.key === 'notify' && draft.then.includes('notify')}
							<!-- Notification Center stacks the notifications that share this field's value. -->
							<div class="cond indent">
								<div class="is">Group by</div>
								<Popover open={picking_group} onclose={() => (picking_group = false)} testid="group-menu" style="padding: 6px">
									<div class="pick" hitbox="self" testId="group-by" tabindex={0} onclick={() => (picking_group = !picking_group)}>
										<div>{field(draft.group_by ?? 'repo').title}</div>
										<svg class="chev" source={chevron}></svg>
									</div>
									{#snippet content()}
										<div class="menu">
											{#each FIELDS as f (f.key)}
												<div
													class="menu-item"
													testId="group-pick-{f.key}"
													onclick={() => {
														draft!.group_by = f.key;
														picking_group = false;
													}}
												>
													{f.title}
												</div>
											{/each}
										</div>
									{/snippet}
								</Popover>
							</div>
							<div class="step indent">
								{@render switch_(!!draft.ring_at_launch, () => (draft!.ring_at_launch = !draft!.ring_at_launch), 'ring-at-launch')}
								<div class="label">Also ring for what's there when Gitbox starts</div>
							</div>
						{/if}
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
	.side-list {
		display: flex;
		flex-direction: column;
		flex-grow: 1;
		min-height: 0;
		padding: 12px 12px 12px 12px;
		scrollbar-color: var(--thumb);
		scrollbar-width: 6px;
	}
	.row {
		width: 100%;
		padding-bottom: 6px;
	}
	.indent {
		padding-left: 44px;
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
