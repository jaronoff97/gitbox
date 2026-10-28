import { render_hot } from 'gpuix-svelte';

render_hot(new URL('./App.svelte', import.meta.url), {
	title: 'Gitbox Dev',
	appName: 'Gitbox Dev',
	width: 1470,
	height: 800,
	minWidth: 1150,
	minHeight: 560,
	// On macOS the sidebar and the toolbar are the title bar, with the traffic lights centred in its 52 px.
	titlebarTransparent: process.platform === 'darwin',
	trafficLightX: 20,
	trafficLightY: 19
});
