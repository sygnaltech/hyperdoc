
press F5 to start debugging mode 



# Deploy

npm run build

npx @vscode/vsce package


This produces hd-editor-0.1.0.vsix in the project root. You'll see warnings about missing repository, LICENSE, README.md etc. — those are fine to ignore for personal/internal use. If vsce refuses to package due to one of them, add --allow-missing-repository or create a stub file.

3. Install the .vsix into your main VS Code

Either via UI: Extensions panel → "…" menu → "Install from VSIX…" → pick the file.

Or via CLI:


code --install-extension hd-editor-0.1.0.vsix