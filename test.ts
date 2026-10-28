import { mount_headless, click_test_id, all_text, check, finish } from 'gpuix-svelte/test';
import App from './App.svelte';

mount_headless(App, { width: 400, height: 300 });

click_test_id('confirm');

check('the button confirms', all_text().includes('It works'));
finish('gitbox', 1);
