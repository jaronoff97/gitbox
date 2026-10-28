<script lang="ts">
	import { set_css_vars } from 'gpuix-svelte';
	import Board from './src/Board.svelte';
	import Onboarding from './src/Onboarding.svelte';
	import { init, settings } from './src/settings.svelte.ts';
	import { css_vars, system_dark } from './src/theme.ts';
	import { listen } from './src/commands.svelte.ts';
	import { install, menu_json, type Menu } from './src/menubar.ts';
	import { load, save } from './src/store.ts';

	init();
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
	$effect(() => set_css_vars(css_vars(settings, settings.theme === 'system' ? dark : settings.theme === 'dark')));
</script>

<div class="app" class:center={!onboarded}>
	{#if onboarded}
		<Board onsetup={() => set_onboarded(false)} />
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
	.app.center {
		align-items: center;
		justify-content: center;
	}
</style>
