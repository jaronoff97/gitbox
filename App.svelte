<script lang="ts">
	import { set_css_vars } from 'gpuix-svelte';
	import Automations from './src/Automations.svelte';
	import Board from './src/Board.svelte';
	import Chat from './src/Chat.svelte';
	import Jobs from './src/Jobs.svelte';
	import { init as init_automations, watch } from './src/automations.svelte.ts';
	import Onboarding from './src/Onboarding.svelte';
	import { init, settings } from './src/settings.svelte.ts';
	import { css_vars, system_dark } from './src/theme.ts';
	import { listen } from './src/commands.svelte.ts';
	import { install, menu_json, type Menu } from './src/menubar.ts';
	import { register } from './src/commands.svelte.ts';
	import { chat, inbox, zap } from './src/icons.ts';
	import { load, save } from './src/store.ts';

	init();
	init_automations();
	// The one window key handler; every shortcut is a command in the registry (src/commands.svelte.ts).
	$effect(listen);

	// The native menu bar (#7): on macOS under Bun. It follows the registry, so a command, a check mark
	// or an enabled state that changes sends the menus again (menubar.ts skips an unchanged one).
	let menubar = $state<{ set(menus: Menu[]): void; stop(): void } | null>(null);
	$effect(() => {
		let gone = false;
		install().then((m) => (gone ? m?.stop() : (menubar = m)));
		return () => {
			gone = true;
			menubar?.stop();
		};
	});
	$effect(() => menubar?.set(menu_json()));
	let onboarded = $state(load().onboarded === true);

	// Automations run while gh works, whichever tab is open.
	$effect(() => {
		if (onboarded) return watch();
	});

	function set_onboarded(value: boolean) {
		save({ onboarded: value });
		onboarded = value;
	}

	// The look (#8): palette, text size and density, as CSS variables. "System" asks macOS every 30 s.
	let dark = $state(true);
	$effect(() => {
		if (settings.theme !== 'system') return;
		const check = () => system_dark().then((d) => (dark = d));
		check();
		const timer = setInterval(check, 30_000);
		return () => clearInterval(timer);
	});
	$effect(() =>
		set_css_vars({ ...css_vars(settings, settings.theme === 'system' ? dark : settings.theme === 'dark'), sidebar: '190px' })
	);

	/** On macOS the window has no title bar (app.ts), and the traffic lights sit atop the sidebar. */
	const MAC = process.platform === 'darwin';

	// The sidebar's tabs. The board stays mounted while hidden, so its cards and scroll survive a switch.
	const VIEWS = [
		{ key: 'inbox', title: 'Inbox', icon: inbox },
		{ key: 'automations', title: 'Automations', icon: zap },
		{ key: 'chat', title: 'Chat', icon: chat }
	];
	let view = $state('inbox');

	$effect(() =>
		register(
			VIEWS.map((v, i) => ({ id: `go.${v.key}`, title: v.title, group: 'go' as const, keys: `ctrl-${i + 1}`, run: () => (view = v.key) }))
		)
	);
</script>

<div class="app" class:center={!onboarded}>
	{#if onboarded}
		<div class="sidebar" class:mac={MAC}>
			{#each VIEWS as v (v.key)}
				<div class="nav" class:on={view === v.key} hitbox="self" testId={`nav-${v.key}`} tabindex={0} onclick={() => (view = v.key)}>
					<svg class="icon" source={v.icon}></svg>
					<div>{v.title}</div>
				</div>
			{/each}
		</div>
		<div class="main">
			<Board active={view === 'inbox'} onsetup={() => set_onboarded(false)} />
			{#if view !== 'inbox'}
				<div class="view">
					{#if view === 'automations'}
						<Automations />
					{:else}
						<Chat />
					{/if}
				</div>
			{/if}
		</div>
		<Jobs />
	{:else}
		<Onboarding ondone={() => set_onboarded(true)} />
	{/if}
</div>

<style>
	.app {
		display: flex;
		width: 100%;
		height: 100%;
		background-color: var(--bg);
	}
	.sidebar {
		display: flex;
		flex-direction: column;
		gap: 2px;
		width: var(--sidebar);
		flex-shrink: 0;
		padding: 12px 10px;
		border-right-width: 1px;
		border-color: var(--separator);
		background-color: var(--lane);
		user-select: none;
	}
	.sidebar.mac {
		/* Below the traffic lights, which app.ts centres in the top 52 px. */
		padding-top: 52px;
	}
	.nav {
		display: flex;
		align-items: center;
		gap: 8px;
		height: 28px;
		padding: 0px 8px;
		border-radius: 6px;
		font-size: var(--text-md, 13px);
		color: var(--muted);
		cursor: pointer;
	}
	.nav:hover {
		color: var(--ink);
		background-color: var(--tool-hover);
	}
	.nav.on {
		color: var(--ink);
		background-color: var(--border);
	}
	.nav:focus-visible {
		outline-width: 2px;
		outline-color: var(--accent);
	}
	.icon {
		width: 15px;
		height: 15px;
	}
	.main {
		display: flex;
		flex-grow: 1;
		flex-basis: 0;
		min-width: 0;
		position: relative;
	}
	.view {
		display: flex;
		flex-direction: column;
		position: absolute;
		inset: 0;
		background-color: var(--bg);
	}
	.app.center {
		align-items: center;
		justify-content: center;
	}
</style>
