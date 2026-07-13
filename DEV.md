
press F5 to start debugging mode 



# Deploy

1. Build + package in one step:

    npm run package

   This deletes any old `hd-editor-*.vsix`, builds the bundle (via the
   `vscode:prepublish` hook), and produces a fresh `hd-editor-<version>.vsix` in
   the project root, where `<version>` is the `version` field in package.json
   (e.g. `hd-editor-0.1.2.vsix`). Warnings about missing repository / LICENSE /
   README are fine to ignore for internal use.

   Because the clean step runs first, only the current version's `.vsix` is ever
   left in the root — you can't accidentally install a stale one.

2. Install the .vsix into your main VS Code.

   Either via UI: Extensions panel → "…" menu → "Install from VSIX…" → pick the file.

   Or via CLI — let the shell fill in the current version so you never install a
   stale file (PowerShell):

    code --install-extension "hd-editor-$((Get-Content package.json -Raw | ConvertFrom-Json).version).vsix" --force

3. Reload EVERY already-open VS Code window: Ctrl+Shift+P → "Developer: Reload
   Window" (or restart VS Code). Installing a VSIX does NOT update windows that are
   already running — that's the usual reason a fresh build still shows the old
   editor. For an open .hd tab, close and reopen it too (the custom editor retains
   its webview while hidden).