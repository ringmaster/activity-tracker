import yaml from "js-yaml";
import type { App, TFile } from "obsidian";
import type { CombatAction } from "../types/encounter";

export interface LibraryData {
  actions: CombatAction[];
}

let cachedLibrary: CombatAction[] = [];
let cachedPath: string = "";

/**
 * Load the actions library from the configured note.
 * Caches the result; call invalidateLibraryCache() to force reload.
 */
export async function loadLibrary(
  app: App,
  libraryPath: string,
): Promise<CombatAction[]> {
  if (cachedPath === libraryPath && cachedLibrary.length > 0) {
    return cachedLibrary;
  }

  const file = app.vault.getAbstractFileByPath(libraryPath);
  if (!file || !("extension" in file)) return [];

  const content = await app.vault.read(file as TFile);
  const parsed = parseLibraryContent(content);
  cachedLibrary = parsed;
  cachedPath = libraryPath;
  return parsed;
}

/** Synchronous access to the cached library (returns empty if not yet loaded). */
export function getCachedLibrary(): CombatAction[] {
  return cachedLibrary;
}

export function invalidateLibraryCache(): void {
  cachedLibrary = [];
  cachedPath = "";
}

/** Look up an action by name from the cached library. */
export function findLibraryAction(name: string): CombatAction | undefined {
  const lower = name.toLowerCase();
  return cachedLibrary.find((a) => a.name.toLowerCase() === lower);
}

/** Search the cached library by partial name match. */
export function searchLibrary(query: string): CombatAction[] {
  if (query.length < 2) return [];
  const lower = query.toLowerCase();
  return cachedLibrary.filter((a) => a.name.toLowerCase().includes(lower)).slice(0, 10);
}

/**
 * Add an action to the library file. Reads, merges, writes back.
 */
export async function addToLibrary(
  app: App,
  libraryPath: string,
  action: CombatAction,
): Promise<void> {
  const file = app.vault.getAbstractFileByPath(libraryPath);

  let existing: CombatAction[] = [];
  let content = "";
  let format: "bare" | "codeblock" = "codeblock";

  if (file && "extension" in file) {
    content = await app.vault.read(file as TFile);
    existing = parseLibraryContent(content);

    // Check if already exists
    if (existing.some((a) => a.name.toLowerCase() === action.name.toLowerCase())) {
      return;
    }

    // Detect format
    if (content.match(/```ya?ml/)) {
      format = "codeblock";
    } else {
      format = "bare";
    }
  }

  existing.push(action);
  const newYaml = yaml.dump({ actions: existing }, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });

  if (!file) {
    // Create the file
    await app.vault.create(libraryPath, "```yaml\n" + newYaml.trimEnd() + "\n```\n");
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

  // Update cache
  cachedLibrary = existing;
  cachedPath = libraryPath;
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
