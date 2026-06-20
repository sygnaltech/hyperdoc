import * as vscode from 'vscode';
import * as path from 'path';
import { parseDocument } from '../format/parser';
import { isValidId } from '../identity/base62';
import { assetFolderFor } from './paths';

interface MoveItem { id: string; from: vscode.Uri; to: vscode.Uri; }
interface Collision { id: string; flat?: vscode.Uri; mirrored: vscode.Uri[]; }
interface Orphan    { id: string; paths: vscode.Uri[]; }

interface Plan {
  alreadyFlat: { id: string; path: vscode.Uri }[];
  willMove: MoveItem[];
  collisions: Collision[];
  orphans: Orphan[];
  docsMissingId: vscode.Uri[];
  idConflicts: Map<string, vscode.Uri[]>;
}

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'out', '.hd']);

export function registerMigrateCommand(): vscode.Disposable {
  return vscode.commands.registerCommand('hd.migrateAssetsToFlat', runMigrate);
}

async function runMigrate(): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    vscode.window.showWarningMessage('HD migrate: no workspace folder is open.');
    return;
  }
  const folder = folders.length === 1
    ? folders[0]
    : await vscode.window.showWorkspaceFolderPick({ placeHolder: 'Pick the HD workspace to migrate' });
  if (!folder) return;

  const out = vscode.window.createOutputChannel('HD Migrate');
  out.show(true);
  out.appendLine(`[migrate] workspace : ${folder.uri.fsPath}`);

  const plan = await buildPlan(folder.uri, out);

  out.appendLine('');
  out.appendLine(`Plan:`);
  out.appendLine(`  already-flat   : ${plan.alreadyFlat.length}`);
  out.appendLine(`  will-move      : ${plan.willMove.length}`);
  out.appendLine(`  collisions     : ${plan.collisions.length}`);
  out.appendLine(`  orphans        : ${plan.orphans.length}`);
  out.appendLine(`  doc-missing-id : ${plan.docsMissingId.length}`);
  out.appendLine(`  doc-id-conflict: ${plan.idConflicts.size}`);
  out.appendLine('');

  if (plan.willMove.length > 0) {
    out.appendLine('Will move:');
    for (const m of plan.willMove) {
      out.appendLine(`  ${rel(folder.uri, m.from)}  →  ${rel(folder.uri, m.to)}`);
    }
    out.appendLine('');
  }
  if (plan.collisions.length > 0) {
    out.appendLine('COLLISIONS (left alone, manual review needed):');
    for (const c of plan.collisions) {
      out.appendLine(`  id ${c.id}`);
      if (c.flat) out.appendLine(`    flat     : ${rel(folder.uri, c.flat)}`);
      for (const m of c.mirrored) out.appendLine(`    mirrored : ${rel(folder.uri, m)}`);
    }
    out.appendLine('');
  }
  if (plan.orphans.length > 0) {
    out.appendLine('Orphans (no doc references this id — left alone):');
    for (const o of plan.orphans) {
      for (const p of o.paths) out.appendLine(`  ${o.id}  ${rel(folder.uri, p)}`);
    }
    out.appendLine('');
  }
  if (plan.docsMissingId.length > 0) {
    out.appendLine(`Docs without id frontmatter (left alone): ${plan.docsMissingId.length}`);
    for (const u of plan.docsMissingId.slice(0, 10)) out.appendLine(`  ${rel(folder.uri, u)}`);
    if (plan.docsMissingId.length > 10) out.appendLine(`  …and ${plan.docsMissingId.length - 10} more`);
    out.appendLine('');
  }

  if (plan.willMove.length === 0) {
    out.appendLine('[migrate] nothing to move.');
    vscode.window.showInformationMessage(`HD migrate: nothing to move. ${plan.alreadyFlat.length} folder(s) already flat.`);
    return;
  }

  const choice = await vscode.window.showInformationMessage(
    `HD migrate: move ${plan.willMove.length} asset folder(s) to the flat layout? (See "HD Migrate" output for the plan.)`,
    { modal: true },
    'Apply', 'Cancel'
  );
  if (choice !== 'Apply') {
    out.appendLine('[migrate] cancelled.');
    return;
  }

  let moved = 0;
  let failed = 0;
  for (const m of plan.willMove) {
    try {
      await vscode.workspace.fs.rename(m.from, m.to, { overwrite: false });
      moved++;
    } catch (e) {
      failed++;
      out.appendLine(`[migrate] FAILED to move ${rel(folder.uri, m.from)}: ${String(e)}`);
    }
  }
  out.appendLine(`[migrate] moved ${moved} folder(s)${failed ? `, ${failed} failed` : ''}.`);

  // Best-effort cleanup of now-empty mirrored parents.
  const hdRoot = vscode.Uri.joinPath(folder.uri, '.hd');
  const parents = new Set(plan.willMove.map(m => path.dirname(m.from.fsPath)));
  let cleaned = 0;
  for (const p of parents) {
    let cur = p;
    while (cur && cur.startsWith(hdRoot.fsPath) && cur !== hdRoot.fsPath) {
      try {
        const entries = await vscode.workspace.fs.readDirectory(vscode.Uri.file(cur));
        if (entries.length > 0) break;
        await vscode.workspace.fs.delete(vscode.Uri.file(cur));
        cleaned++;
        cur = path.dirname(cur);
      } catch { break; }
    }
  }
  if (cleaned > 0) out.appendLine(`[migrate] cleaned up ${cleaned} now-empty director(ies).`);

  vscode.window.showInformationMessage(
    `HD migrate: moved ${moved} folder(s)${failed ? `, ${failed} failed` : ''}. Reload any open HD editors to see assets resolve.`
  );
}

async function buildPlan(workspace: vscode.Uri, out: vscode.OutputChannel): Promise<Plan> {
  const hdFiles = await walkHdFiles(workspace);
  out.appendLine(`[migrate] found ${hdFiles.length} .hd file(s)`);

  const idToDoc = new Map<string, vscode.Uri>();
  const docsMissingId: vscode.Uri[] = [];
  const idConflicts = new Map<string, vscode.Uri[]>();
  for (const f of hdFiles) {
    const id = await readDocId(f);
    if (!id) { docsMissingId.push(f); continue; }
    if (idToDoc.has(id)) {
      const existing = idConflicts.get(id) ?? [idToDoc.get(id)!];
      existing.push(f);
      idConflicts.set(id, existing);
    } else {
      idToDoc.set(id, f);
    }
  }

  const hdRoot = vscode.Uri.joinPath(workspace, '.hd');
  const idLocations = await findIdFolders(hdRoot);
  out.appendLine(`[migrate] found ${idLocations.size} asset folder id(s)`);

  const plan: Plan = {
    alreadyFlat: [],
    willMove: [],
    collisions: [],
    orphans: [],
    docsMissingId,
    idConflicts
  };

  for (const [id, paths] of idLocations) {
    const docUri = idToDoc.get(id);
    if (!docUri) { plan.orphans.push({ id, paths }); continue; }

    const flat = assetFolderFor(docUri, id, workspace);
    const flatStr = flat.fsPath;
    const hasFlat = paths.some(p => p.fsPath === flatStr);
    const mirrored = paths.filter(p => p.fsPath !== flatStr);

    if (hasFlat && mirrored.length === 0) {
      plan.alreadyFlat.push({ id, path: flat });
    } else if (hasFlat && mirrored.length > 0) {
      plan.collisions.push({ id, flat, mirrored });
    } else if (mirrored.length === 1) {
      plan.willMove.push({ id, from: mirrored[0], to: flat });
    } else {
      plan.collisions.push({ id, mirrored });
    }
  }
  return plan;
}

async function walkHdFiles(root: vscode.Uri): Promise<vscode.Uri[]> {
  const out: vscode.Uri[] = [];
  async function walk(dir: vscode.Uri): Promise<void> {
    let entries: [string, vscode.FileType][];
    try { entries = await vscode.workspace.fs.readDirectory(dir); }
    catch { return; }
    for (const [name, type] of entries) {
      if (SKIP_DIRS.has(name)) continue;
      if (type & vscode.FileType.Directory) {
        await walk(vscode.Uri.joinPath(dir, name));
      } else if (type & vscode.FileType.File) {
        if (name.toLowerCase().endsWith('.hd')) out.push(vscode.Uri.joinPath(dir, name));
      }
    }
  }
  await walk(root);
  return out;
}

async function readDocId(uri: vscode.Uri): Promise<string | null> {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    const text = new TextDecoder().decode(bytes);
    const { meta } = parseDocument(text);
    const id = meta && (meta as Record<string, unknown>).id;
    return typeof id === 'string' && isValidId(id) ? id : null;
  } catch { return null; }
}

async function findIdFolders(hdRoot: vscode.Uri): Promise<Map<string, vscode.Uri[]>> {
  const out = new Map<string, vscode.Uri[]>();
  async function walk(dir: vscode.Uri): Promise<void> {
    let entries: [string, vscode.FileType][];
    try { entries = await vscode.workspace.fs.readDirectory(dir); }
    catch { return; }
    for (const [name, type] of entries) {
      if (!(type & vscode.FileType.Directory)) continue;
      const full = vscode.Uri.joinPath(dir, name);
      if (isValidId(name)) {
        const arr = out.get(name) ?? [];
        arr.push(full);
        out.set(name, arr);
        continue;
      }
      await walk(full);
    }
  }
  await walk(hdRoot);
  return out;
}

function rel(workspace: vscode.Uri, uri: vscode.Uri): string {
  return path.relative(workspace.fsPath, uri.fsPath);
}
