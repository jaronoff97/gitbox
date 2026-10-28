import { render_hot } from 'gpuix-svelte';

render_hot(new URL('./App.svelte', import.meta.url), {
	title: 'Gitbox Dev',
	appName: 'Gitbox Dev',
	width: 1280,
	height: 800,
	minWidth: 960,
	minHeight: 560,
	// On macOS the board's toolbar is the title bar, with the traffic lights centred in its 52 px.
	titlebarTransparent: process.platform === 'darwin',
	trafficLightX: 20,
	trafficLightY: 19
});
