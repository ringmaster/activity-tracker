import yaml from "js-yaml";
import type { App, TFile } from "obsidian";
import type { CombatAction } from "../types/encounter";

export interface LibraryData {
  actions: CombatAction[];
}

let cachedLibrary: CombatAction[] = [];
let cachedPaths: string = "";

/**
 * Load actions from all configured library files.
 * Paths is a comma-separated string of vault file paths.
 * Caches the merged result.
 */
export async function loadLibrary(
  app: App,
  paths: string,
): Promise<CombatAction[]> {
  if (cachedPaths === paths && cachedLibrary.length > 0) {
    return cachedLibrary;
  }

  const allActions: CombatAction[] = [];
  const pathList = paths.split(",").map((p) => p.trim()).filter((p) => p.length > 0);

  for (const path of pathList) {
    const file = app.vault.getAbstractFileByPath(path);
    if (!file || !("extension" in file)) continue;

    const content = await app.vault.read(file as TFile);
    const parsed = parseLibraryContent(content);
    allActions.push(...parsed);
  }

  cachedLibrary = allActions;
  cachedPaths = paths;
  return allActions;
}

/** Synchronous access to the cached library. */
export function getCachedLibrary(): CombatAction[] {
  return cachedLibrary;
}

export function invalidateLibraryCache(): void {
  cachedLibrary = [];
  cachedPaths = "";
}

/** Look up an action/spell by name from the cached library. */
export function findLibraryAction(name: string): CombatAction | undefined {
  const lower = name.toLowerCase();
  return cachedLibrary.find((a) => a.name.toLowerCase() === lower);
}

/** Search the cached library by partial name match. */
export function searchLibrary(query: string, limit = 10): CombatAction[] {
  if (query.length < 2) return [];
  const lower = query.toLowerCase();
  return cachedLibrary.filter((a) => a.name.toLowerCase().includes(lower)).slice(0, limit);
}

/**
 * Add an action to a library file. Reads, merges, writes back.
 * Writes to the first path in the comma-separated list.
 */
export async function addToLibrary(
  app: App,
  paths: string,
  action: CombatAction,
): Promise<void> {
  // Use the first path as the write target
  const pathList = paths.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  const libraryPath = pathList[0];
  if (!libraryPath) return;

  const file = app.vault.getAbstractFileByPath(libraryPath);

  let existing: CombatAction[] = [];
  let content = "";
  let format: "bare" | "codeblock" = "bare";

  if (file && "extension" in file) {
    content = await app.vault.read(file as TFile);
    existing = parseLibraryContent(content);

    if (existing.some((a) => a.name.toLowerCase() === action.name.toLowerCase())) {
      return;
    }

    if (content.match(/```ya?ml/)) {
      format = "codeblock";
    }
  }

  existing.push(action);
  const newYaml = yaml.dump({ actions: existing }, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });

  if (!file) {
    await app.vault.create(libraryPath, newYaml);
  } else if (format === "codeblock") {
    const blockMatch = content.match(/```ya?ml\s*\n([\s\S]*?)```/);
    if (blockMatch) {
      const langTag = content.match(/```(ya?ml)\s*\n/)?.[0] ?? "```yaml\n";
      const updated = content.replace(blockMatch[0], langTag + newYaml.trimEnd() + "\n```");
      await app.vault.modify(file as TFile, updated);
    }
  } else {
    await app.vault.modify(file as TFile, newYaml);
  }

  // Invalidate cache so next load picks up changes
  invalidateLibraryCache();
}

function parseLibraryContent(content: string): CombatAction[] {
  // Try bare YAML
  try {
    const parsed = yaml.load(content) as LibraryData;
    if (parsed?.actions && Array.isArray(parsed.actions)) {
      return parsed.actions;
    }
  } catch { /* not bare YAML */ }

  // Try code block
  const blockMatch = content.match(/```ya?ml\s*\n([\s\S]*?)```/);
  if (blockMatch) {
    try {
      const parsed = yaml.load(blockMatch[1]) as LibraryData;
      if (parsed?.actions && Array.isArray(parsed.actions)) {
        return parsed.actions;
      }
    } catch { /* malformed */ }
  }

  // Try frontmatter
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    try {
      const parsed = yaml.load(fmMatch[1]) as LibraryData;
      if (parsed?.actions && Array.isArray(parsed.actions)) {
        return parsed.actions;
      }
    } catch { /* malformed */ }
  }

  return [];
}
