/// <reference types="bun" />
// `bun build.ts` (npm run build): compiles standalone.ts into one executable for the platform it
// runs on. On macOS it also wraps that as dist/Gitbox.app (bundle.ts), signs it, and packs
// dist/gitbox-<version>-macos-arm64.dmg. The signing follows gpuix-svelte's scripts/compile.ts.
//
// Signing on macOS, from the environment (a .env beside package.json works; Bun loads it):
//   CODESIGN_IDENTITY="Developer ID Application: Name (TEAMID)"  hardened runtime + entitlements
//   NOTARY_PROFILE=notary                                         notarytool keychain profile
// Without CODESIGN_IDENTITY the app is signed ad hoc: it runs here, and a downloaded copy has to
// be allowed under System Settings → Privacy & Security.

import type { BunPlugin } from 'bun';
import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { load_module, load_svelte, resolve_native_cjs, resolve_svelte } from 'gpuix-svelte/plugin';
import { run, write_bundle } from './bundle.ts';
import pkg from './package.json' with { type: 'json' };

const conditions = ['custom-renderer', 'production'];
const outfile = process.platform === 'win32' ? 'dist/gitbox.exe' : 'dist/gitbox';
const identity = process.env.CODESIGN_IDENTITY;
const notary = process.env.NOTARY_PROFILE;

// A `.svelte` import that misses the plugin silently becomes a file asset, so count what went through it.
let components = 0;
const plugin: BunPlugin = {
	name: 'gpuix-svelte',
	setup(build) {
		build.onResolve({ filter: /^@gpuix\/native$/ }, resolve_native_cjs);
		build.onResolve({ filter: /^svelte(\/|$)/ }, resolve_svelte(conditions));
		build.onLoad({ filter: /\.svelte\.[jt]s$/ }, load_module);
		build.onLoad({ filter: /\.svelte$/ }, (args) => {
			components++;
			return load_svelte(args);
		});
	}
};

rmSync('dist', { recursive: true, force: true });

const result = await Bun.build({
	entrypoints: ['./standalone.ts'],
	target: 'bun',
	conditions,
	define: { 'process.env.NODE_ENV': '"production"' },
	minify: true,
	plugins: [plugin],
	throw: false,
	compile: {
		outfile,
		autoloadBunfig: false,
		autoloadDotenv: false,
		...(process.platform === 'win32' && { windows: { hideConsole: true } })
	}
});

if (!result.success || components === 0) {
	for (const log of result.logs) console.error(log);
	if (components === 0) console.error('no .svelte file went through the plugin');
	process.exit(1);
}
console.log(`built ${outfile}`);

if (process.platform === 'darwin') {
	const app = 'dist/Gitbox.app';
	write_bundle(app, outfile);
	sign(app);
	if (identity && notary) notarize(app);
	dmg(app, `dist/gitbox-${pkg.version}-macos-arm64.dmg`);
}

// Under the hardened runtime Bun's JIT needs executable memory, and the GPUI addon is extracted and
// dlopen'd at launch without the team's signature, which library validation would refuse.
const ENTITLEMENTS = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
	<key>com.apple.security.cs.allow-jit</key>
	<true/>
	<key>com.apple.security.cs.allow-unsigned-executable-memory</key>
	<true/>
	<key>com.apple.security.cs.disable-executable-page-protection</key>
	<true/>
	<key>com.apple.security.cs.allow-dyld-environment-variables</key>
	<true/>
	<key>com.apple.security.cs.disable-library-validation</key>
	<true/>
</dict>
</plist>
`;

function sign(target: string) {
	if (!identity) {
		run('codesign', ['--force', '--deep', '--sign', '-', target]);
		console.log(`signed ${target} ad hoc (set CODESIGN_IDENTITY to sign for distribution)`);
		return;
	}
	writeFileSync('dist/entitlements.plist', ENTITLEMENTS);
	run('codesign', ['--force', '--options', 'runtime', '--timestamp', '--entitlements', 'dist/entitlements.plist', '--sign', identity, target]);
	run('codesign', ['--verify', '--strict', target]);
	console.log(`signed ${target} as ${identity}`);
}

// Stapling works only on the bundle, so the ticket goes on before the .dmg is made from it.
function notarize(target: string) {
	const zip = 'dist/notarize.zip';
	run('ditto', ['-c', '-k', '--keepParent', target, zip]);
	console.log('notarizing (Apple usually takes a few minutes)');
	const output = run('xcrun', ['notarytool', 'submit', zip, '--keychain-profile', notary!, '--wait']);
	if (!/status: Accepted/.test(output)) {
		console.error(`notarization was not accepted; see \`xcrun notarytool log\`:\n${output}`);
		process.exit(1);
	}
	run('xcrun', ['stapler', 'staple', target]);
	rmSync(zip);
	console.log(`notarized and stapled ${target}`);
}

// A disk image with the app and an Applications link, the usual drag-to-install window.
function dmg(app: string, out: string) {
	const stage = 'dist/dmg';
	mkdirSync(stage);
	run('ditto', [app, `${stage}/Gitbox.app`]);
	symlinkSync('/Applications', `${stage}/Applications`);
	run('hdiutil', ['create', '-volname', 'Gitbox', '-srcfolder', stage, '-ov', '-format', 'UDZO', out]);
	rmSync(stage, { recursive: true });
	if (identity) run('codesign', ['--force', '--sign', identity, out]);
	console.log(`packed ${out}`);
}
