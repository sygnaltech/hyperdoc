#!/usr/bin/env node
/**
 * Shim for ../../../scripts/migrate-assets-flat.mjs.
 * Keeps the skill self-contained under a symlink install; see the note in
 * ./new-id.mjs and SKILL.md § Running the bundled scripts.
 */
import '../../../scripts/migrate-assets-flat.mjs'
