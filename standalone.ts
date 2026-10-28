// The entry `npm run build` compiles: a binary carries no source to hot-reload, so it imports the
// component statically and mounts it with `render`.
import { render } from 'gpuix-svelte';
import App from './App.svelte';

render(App, {
	title: 'Gitbox',
	appName: 'Gitbox',
	width: 1470,
	height: 800,
	minWidth: 1150,
	minHeight: 560,
	// On macOS the sidebar and the toolbar are the title bar, with the traffic lights centred in its 52 px.
	titlebarTransparent: process.platform === 'darwin',
	trafficLightX: 20,
	trafficLightY: 19
});
