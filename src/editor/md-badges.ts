import * as vscode from 'vscode';

/**
 * Concept-first badge picker: the user chooses a kind of badge in plain
 * language and answers a prompt or two; we assemble the shields.io Markdown so
 * they never have to remember the URL shape. Returns the Markdown to insert, or
 * undefined if cancelled.
 */
export async function pickBadge(): Promise<string | undefined> {
  type BadgeKind = 'md' | 'npm' | 'ghstars' | 'ghactions' | 'custom';
  interface Item extends vscode.QuickPickItem {
    badgeKind: BadgeKind;
    md?: string;
  }

  const items: Item[] = [
    { label: 'License: MIT', badgeKind: 'md', description: 'shields.io static', md: '[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)' },
    { label: 'Build: passing', badgeKind: 'md', description: 'shields.io static', md: '[![Build](https://img.shields.io/badge/build-passing-brightgreen)](#)' },
    { label: 'PRs welcome', badgeKind: 'md', description: 'shields.io static', md: '[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen)](CONTRIBUTING.md)' },
    { label: 'npm version…', badgeKind: 'npm', description: 'live from npm' },
    { label: 'GitHub stars…', badgeKind: 'ghstars', description: 'live from GitHub' },
    { label: 'GitHub Actions build…', badgeKind: 'ghactions', description: 'workflow status' },
    { label: 'Custom static badge…', badgeKind: 'custom', description: 'label / message / colour' }
  ];

  const chosen = await vscode.window.showQuickPick(items, { placeHolder: 'Insert a badge' });
  if (!chosen) return undefined;

  switch (chosen.badgeKind) {
    case 'md':
      return chosen.md;

    case 'npm': {
      const pkg = await input('npm package name', 'my-package');
      if (!pkg) return undefined;
      const e = encodeURIComponent(pkg);
      return `[![npm](https://img.shields.io/npm/v/${e})](https://www.npmjs.com/package/${e})`;
    }

    case 'ghstars': {
      const repo = await askRepo();
      if (!repo) return undefined;
      return `[![Stars](https://img.shields.io/github/stars/${repo})](https://github.com/${repo})`;
    }

    case 'ghactions': {
      const repo = await askRepo();
      if (!repo) return undefined;
      const wf = await input('Workflow file name', 'ci.yml');
      if (!wf) return undefined;
      return `[![Build](https://img.shields.io/github/actions/workflow/status/${repo}/${encodeURIComponent(wf)}?branch=main)](https://github.com/${repo}/actions)`;
    }

    case 'custom': {
      const label = await input('Badge label (left side)', 'label');
      if (label === undefined) return undefined;
      const message = await input('Badge message (right side)', 'value');
      if (message === undefined) return undefined;
      const color = await input('Colour', 'blue', 'blue, green, red, orange, or #hex');
      if (color === undefined) return undefined;
      // The query form avoids shields' dash/underscore path-escaping rules.
      const url =
        'https://img.shields.io/static/v1' +
        `?label=${encodeURIComponent(label)}` +
        `&message=${encodeURIComponent(message)}` +
        `&color=${encodeURIComponent(color)}`;
      return `![${label}](${url})`;
    }
  }

  return undefined;
}

function input(prompt: string, value?: string, placeHolder?: string): Thenable<string | undefined> {
  return vscode.window.showInputBox({ prompt, value, placeHolder, ignoreFocusOut: true });
}

async function askRepo(): Promise<string | undefined> {
  const repo = await input('GitHub owner/repo', undefined, 'owner/repo');
  if (!repo || !repo.includes('/')) return undefined;
  return repo
    .trim()
    .split('/')
    .map((s) => encodeURIComponent(s))
    .join('/');
}
