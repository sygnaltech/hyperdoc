#!/usr/bin/env node
/**
 * Shim for ../../../scripts/new-id.mjs.
 *
 * The skill is often installed as a bare symlink into ~/.claude/skills/, which
 * exposes the skill folder and nothing above it — so the plugin's real scripts/
 * directory (a sibling of skills/) is unreachable from inside. These shims make
 * the skill self-contained, so `<skill-base-dir>/scripts/<name>.mjs` resolves
 * under every install layout. See SKILL.md § Running the bundled scripts.
 *
 * The target runs on import and reads process.argv itself, so a bare import is
 * all that is needed — arguments pass straight through.
 */
import '../../../scripts/new-id.mjs'
