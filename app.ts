import { render_hot } from 'gpuix-svelte';

render_hot(new URL('./App.svelte', import.meta.url), {
	title: 'gitbox',
	width: 1280,
	height: 800
});
