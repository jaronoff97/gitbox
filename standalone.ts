// The entry `npm run build` compiles: a binary carries no source to hot-reload, so it imports the
// component statically and mounts it with `render`.
import { render } from 'gpuix-svelte';
import App from './App.svelte';

render(App, {
	title: 'Gitbox',
	appName: 'Gitbox',
	width: 1280,
	height: 800,
	minWidth: 960,
	minHeight: 560
});
