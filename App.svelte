<script lang="ts">
	import { set_css_vars } from 'gpuix-svelte';
	import Onboarding from './src/Onboarding.svelte';
	import Notifications from './src/Notifications.svelte';
	import { load, save } from './src/store.ts';

	let onboarded = $state(load().onboarded === true);

	function set_onboarded(value: boolean) {
		save({ onboarded: value });
		onboarded = value;
	}

	set_css_vars({
		bg: '#11111b',
		lane: '#181825',
		surface: '#1e1e2e',
		border: '#313244',
		thumb: '#585b70',
		ink: '#cdd6f4',
		muted: '#7f849c',
		accent: '#89b4fa',
		ok: '#a6e3a1',
		fail: '#f38ba8',
		merged: '#cba6f7',
		'popover-surface': '#1e1e2e',
		'popover-border': '#313244',
		'popover-ink': '#cdd6f4'
	});
</script>

<div class="app" class:center={!onboarded}>
	{#if onboarded}
		<Notifications onsetup={() => set_onboarded(false)} />
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
