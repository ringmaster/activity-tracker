import yaml from "js-yaml";
import type { App, TFile } from "obsidian";
import type { EncounterData, AuthoredEncounterData } from "../types/encounter";

/** Parse a YAML string from a dnd-combat code block. */
export function parseEncounterYaml(source: string): AuthoredEncounterData {
  return yaml.load(source) as AuthoredEncounterData;
}

/** Serialize encounter data back to YAML. */
export function serializeEncounterYaml(data: EncounterData): string {
  return yaml.dump(data, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
    quotingType: '"',
    forceQuotes: false,
  });
}

interface BlockBounds {
  openIdx: number;
  closeIdx: number;
  encounterName: string | null;
}

/** Scan file content for all dnd-combat fenced blocks. Returns each block's
 *  opening and closing fence line indices and the `encounter:` name parsed
 *  from its body (or null if missing/unparseable). */
function findCombatBlocks(lines: string[], language: string): BlockBounds[] {
  const blocks: BlockBounds[] = [];
  const openRe = new RegExp("^\\s*```" + escapeRegex(language) + "\\s*$");
  let i = 0;
  while (i < lines.length) {
    if (openRe.test(lines[i])) {
      const openIdx = i;
      let j = i + 1;
      while (j < lines.length && !lines[j].trimStart().startsWith("```")) j++;
      if (j < lines.length) {
        const body = lines.slice(openIdx + 1, j).join("\n");
        blocks.push({
          openIdx,
          closeIdx: j,
          encounterName: extractEncounterName(body),
        });
        i = j + 1;
        continue;
      }
    }
    i++;
  }
  return blocks;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Pull the `encounter:` top-level key value from raw YAML body text without
 *  full parsing (parse may fail or be expensive). */
function extractEncounterName(body: string): string | null {
  const lines = body.split("\n");
  for (const line of lines) {
    const m = line.match(/^encounter:\s*(.*)$/);
    if (m) {
      let val = m[1].trim();
      // Strip optional surrounding quotes
      if ((val.startsWith('"') && val.endsWith('"'))
          || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      return val.length > 0 ? val : null;
    }
  }
  return null;
}

/** Write updated YAML back to the code block in the note. Re-derives block
 *  bounds by scanning the file for fenced `language` blocks and matching the
 *  one whose body's `encounter:` field equals `encounterName`. This is robust
 *  against stale line numbers from sibling-block writes. */
export async function flushToFile(
  app: App,
  file: TFile,
  language: string,
  encounterName: string,
  data: EncounterData,
): Promise<void> {
  const newYaml = serializeEncounterYaml(data);

  await app.vault.process(file, (content) => {
    const lines = content.split("\n");
    const blocks = findCombatBlocks(lines, language);
    const block = blocks.find((b) => b.encounterName === encounterName);

    if (!block) {
      console.error(
        `[dnd-combat] flushToFile: no block found for encounter "${encounterName}" in ${file.path}; refusing to write`,
      );
      return content;
    }

    const before = lines.slice(0, block.openIdx + 1);
    const after = lines.slice(block.closeIdx);
    return [...before, newYaml.trimEnd(), ...after].join("\n");
  });
}

/** Debounced flush helper. Returns a function that debounces writes. */
export function createDebouncedFlush(
  app: App,
  delayMs = 500,
): {
  schedule: (
    file: TFile,
    language: string,
    encounterName: string,
    data: EncounterData,
  ) => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule(file, language, encounterName, data) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        flushToFile(app, file, language, encounterName, data);
      }, delayMs);
    },
    cancel() {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
