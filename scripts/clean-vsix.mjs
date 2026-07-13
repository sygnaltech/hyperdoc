// Remove any previously-built hd-editor-*.vsix from the project root so a new
// package build never leaves stale versions behind (installing the wrong one
// silently reinstalls an old build). Run automatically by `npm run package`.
import { readdirSync, rmSync } from 'node:fs';

const stale = readdirSync(process.cwd()).filter((f) => /^hd-editor-.*\.vsix$/.test(f));

for (const f of stale) {
  rmSync(f, { force: true });
  console.log(`removed ${f}`);
}

if (stale.length === 0) console.log('no old .vsix to remove');
