const esbuild = require('esbuild');
const { copyFileSync, mkdirSync } = require('fs');

const watch = process.argv.includes('--watch');

async function build() {
  mkdirSync('dist', { recursive: true });

  const ctxHost = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    platform: 'node',
    format: 'cjs',
    external: ['vscode'],
    sourcemap: true,
    target: 'node18'
  });

  const ctxWebview = await esbuild.context({
    entryPoints: ['src/webview/main.ts'],
    bundle: true,
    outfile: 'dist/webview.js',
    platform: 'browser',
    format: 'iife',
    sourcemap: true,
    target: 'es2022'
  });

  const ctxWebviewMd = await esbuild.context({
    entryPoints: ['src/webview-md/main.ts'],
    bundle: true,
    outfile: 'dist/webview-md.js',
    platform: 'browser',
    format: 'iife',
    sourcemap: true,
    target: 'es2022'
  });

  if (watch) {
    await ctxHost.watch();
    await ctxWebview.watch();
    await ctxWebviewMd.watch();
    copyStatic();
    console.log('Watching for changes…');
  } else {
    await ctxHost.rebuild();
    await ctxWebview.rebuild();
    await ctxWebviewMd.rebuild();
    copyStatic();
    await ctxHost.dispose();
    await ctxWebview.dispose();
    await ctxWebviewMd.dispose();
    console.log('Build complete.');
  }
}

function copyStatic() {
  copyFileSync('src/webview/styles.css', 'dist/styles.css');
  copyFileSync('src/webview-md/styles.css', 'dist/styles-md.css');
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
