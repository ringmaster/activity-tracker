import yaml from "js-yaml";
import type { App, TFile } from "obsidian";
import type { CombatAction } from "../types/encounter";

export interface LibraryData {
  actions?: CombatAction[];
  spells?: CombatAction[];
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

    // Derive a short label from the filename (e.g., "srd-library.yaml" -> "SRD Library")
    const sourceLabel = path
      .replace(/^.*\//, "")        // strip directory
      .replace(/\.\w+$/, "")       // strip extension
      .replace(/[-_]/g, " ")       // dashes/underscores to spaces
      .replace(/\b\w/g, (c) => c.toUpperCase()); // title case

    const content = await app.vault.read(file as TFile);
    const parsed = parseLibraryContent(content);
    for (const action of parsed) {
      action._source = sourceLabel;
    }
    allActions.push(...parsed);
  }

  cachedLibrary = allActions;
  cachedPaths = paths;
  return allActions;
}

export interface LibraryLoadResult {
  path: string;
  label: string;
  count: number;
  found: boolean;
}

/**
 * Load libraries and return per-file results for UI feedback.
 * Always invalidates the cache first to force a fresh load.
 */
export async function loadLibraryWithResults(
  app: App,
  paths: string,
): Promise<LibraryLoadResult[]> {
  invalidateLibraryCache();

  const results: LibraryLoadResult[] = [];
  const allActions: CombatAction[] = [];
  const pathList = paths.split(",").map((p) => p.trim()).filter((p) => p.length > 0);

  for (const path of pathList) {
    const label = path
      .replace(/^.*\//, "")
      .replace(/\.\w+$/, "")
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

    const file = app.vault.getAbstractFileByPath(path);
    if (!file || !("extension" in file)) {
      results.push({ path, label, count: 0, found: false });
      continue;
    }

    const content = await app.vault.read(file as TFile);
    const parsed = parseLibraryContent(content);
    for (const action of parsed) {
      action._source = label;
    }
    allActions.push(...parsed);
    results.push({ path, label, count: parsed.length, found: true });
  }

  cachedLibrary = allActions;
  cachedPaths = paths;
  return results;
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

  // Add to the in-memory cache immediately so it's available for autocomplete
  cachedLibrary.push(action);
}

/** Normalize field aliases on a loaded action. */
function normalizeAction(action: CombatAction): CombatAction {
  // Accept "description" as alias for "desc"
  const actionAny = action as any;
  if (actionAny.description && !action.desc) {
    action.desc = actionAny.description;
    delete actionAny.description;
  }
  return action;
}

/** Extract actions and spells from a parsed YAML object.
 *  Items under `spells:` get `type: "spell"` if not already set. */
function extractFromParsed(parsed: LibraryData | null): CombatAction[] {
  if (!parsed) return [];
  const results: CombatAction[] = [];

  if (Array.isArray(parsed.actions)) {
    results.push(...parsed.actions.map(normalizeAction));
  }

  if (Array.isArray(parsed.spells)) {
    for (const spell of parsed.spells) {
      if (!spell.type) spell.type = "spell";
      results.push(normalizeAction(spell));
    }
  }

  return results;
}

function parseLibraryContent(content: string): CombatAction[] {
  // Try bare YAML
  try {
    const parsed = yaml.load(content) as LibraryData;
    const results = extractFromParsed(parsed);
    if (results.length > 0) return results;
  } catch { /* not bare YAML */ }

  // Try code block
  const blockMatch = content.match(/```ya?ml\s*\n([\s\S]*?)```/);
  if (blockMatch) {
    try {
      const parsed = yaml.load(blockMatch[1]) as LibraryData;
      const results = extractFromParsed(parsed);
      if (results.length > 0) return results;
    } catch { /* malformed */ }
  }

  // Try frontmatter
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    try {
      const parsed = yaml.load(fmMatch[1]) as LibraryData;
      const results = extractFromParsed(parsed);
      if (results.length > 0) return results;
    } catch { /* malformed */ }
  }

  return [];
}
