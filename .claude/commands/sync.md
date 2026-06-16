---
description: Sync .hd documentation to a configured external platform (project-local test build of /hd:sync).
allowed-tools: Bash, AskUserQuestion
---

Run an HD documentation sync. Interactive — discovers every `hd-sync.json`
under CWD, lets the user pick a config and a destination, then runs the
converter.

## Step 1 — discover

Run the discovery step. It prints JSON describing every `hd-sync.json` found
under CWD and the destinations inside each one:

!`node plugin/hd/scripts/convert.mjs --list`

## Step 2 — interpret discovery output

The JSON has shape:

```json
{
  "cwd": "...",
  "configs": [
    {
      "path": "<abs path to hd-sync.json>",
      "sourceDir": "<abs path to its parent>",
      "destinations": [
        { "name": "...", "type": "...", "description": "...", "path": "...", "resolvedPath": "..." }
      ]
    }
  ],
  "errors": []
}
```

Decide how to proceed:

- **`configs` empty:** Tell the user `No hd-sync.json found in or below <cwd>.` Done — do not call further tools.
- **`errors` non-empty:** Mention each invalid config and what's wrong, then continue with valid configs.
- **Exactly one config and one destination:** Skip prompts. Go to Step 4.
- **One config, multiple destinations:** Skip the config pick. Go to Step 3b.
- **Multiple configs:** Go to Step 3a.

## Step 3a — pick a config

Use `AskUserQuestion`:

- **question:** `"Which hd-sync.json do you want to sync from?"`
- **header:** `"Source config"`
- **options:** one per config (max 4 — if more, list in plain text and ask which). Label = path relative to CWD; description = `"<N> destination(s): name (type), name (type), ..."`.

Then proceed to Step 3b with the chosen config.

## Step 3b — pick a destination

Use `AskUserQuestion`:

- **question:** `"Which destination do you want to sync to?"`
- **header:** `"Destination"`
- **options:** one per destination (max 4). Label = `name`; description = `"[type] → resolvedPath"` (truncate long paths).

## Step 4 — run the sync

`node plugin/hd/scripts/convert.mjs --config "<chosen config path>" --dest "<chosen destination name>"`

Quote both arguments (paths and names can contain spaces).

## Step 5 — report

After the script finishes, summarize for the user:

- **Counts:** files converted, assets copied.
- **Warnings:** group by category (external link, asset missing, orphan) and summarize. If many, list the first few and mention the count.
- **Next step:** the script prints a `next:` line — pass it through (usually `npm run build` in the target).
- Do not edit the converted output files unless the user asks. They are generated artifacts and will be overwritten next sync.
