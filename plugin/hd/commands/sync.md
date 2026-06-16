---
description: Sync .hd documentation to an external platform (Nextra, Docusaurus, GitBook, etc.). Interactive — discovers configs in the codebase, lets you pick a destination, then runs.
allowed-tools: Bash, AskUserQuestion
---

Run an HD documentation sync. This command is interactive: it discovers every
`hd-sync.json` under the current working directory, lets the user pick a
config and a destination, then runs the converter for that destination's
`type`.

## Step 1 — discover

Run the discovery step, which prints JSON describing every `hd-sync.json`
found under CWD and the destinations inside each one:

!`node "${CLAUDE_PLUGIN_ROOT}/scripts/convert.mjs" --list`

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

- **`configs` empty:** Tell the user `No hd-sync.json found in or below <cwd>.` Done — do not call any further tools.
- **`errors` non-empty:** Mention each invalid config and what's wrong, then continue with valid configs (if any).
- **Exactly one config and one destination:** Skip the prompts. Go to Step 4 with those values.
- **One config, multiple destinations:** Skip the config pick. Go to Step 3b.
- **Multiple configs:** Go to Step 3a.

## Step 3a — pick a config

Use `AskUserQuestion` with one question:

- **question:** `"Which hd-sync.json do you want to sync from?"`
- **header:** `"Source config"`
- **options:** one per config (max 4 — if more, list them in plain text in your message and ask the user to type the path). Label = the path relative to CWD; description = `"<N> destination(s): name (type), name (type), ..."`.

If the user picks "Other" or types a path, match it against the discovered configs.

Then proceed to Step 3b with the chosen config.

## Step 3b — pick a destination

Use `AskUserQuestion` with one question:

- **question:** `"Which destination do you want to sync to?"`
- **header:** `"Destination"`
- **options:** one per destination in the chosen config (max 4 — if more, list in plain text). Label = `name`; description = `"[type] → resolvedPath"` (truncate long paths to fit).

## Step 4 — run the sync

Run the converter:

`node "${CLAUDE_PLUGIN_ROOT}/scripts/convert.mjs" --config "<chosen config path>" --dest "<chosen destination name>"`

Quote both arguments (paths and names can contain spaces).

## Step 5 — report

After the script finishes, summarize for the user:

- **Counts:** files converted, assets copied.
- **Warnings:** group by category (external link, asset missing, orphan in target) and summarize. If there are many, list the first few and mention the count.
- **Next step:** the script prints a `next:` line — pass it through (it's usually `npm run build` in the target).
- Do not edit any of the converted output files unless the user asks. They are generated artifacts and will be overwritten next sync.
