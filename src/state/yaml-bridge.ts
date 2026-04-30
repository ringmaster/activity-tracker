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

/**
 * Write updated YAML back to the code block in the note.
 * Uses app.vault.process() for atomic read-modify-write.
 *
 * Instead of relying on sectionInfo line numbers (whose inclusive/exclusive
 * semantics vary), we find the code block fences by scanning content near
 * the expected location.
 */
export async function flushToFile(
  app: App,
  file: TFile,
  sectionStart: number,
  _sectionEnd: number,
  data: EncounterData,
): Promise<void> {
  const newYaml = serializeEncounterYaml(data);

  console.log("[dnd-combat] flushToFile called, sectionStart:", sectionStart);
  console.log("[dnd-combat] YAML output preview:", newYaml.slice(0, 200));

  await app.vault.process(file, (content) => {
    const lines = content.split("\n");

    // Find the opening fence at or near sectionStart
    let openIdx = sectionStart;
    while (openIdx < lines.length && !lines[openIdx].trimStart().startsWith("```")) {
      openIdx++;
    }

    // Find the closing fence: scan forward from the line after the opening fence
    let closeIdx = openIdx + 1;
    while (closeIdx < lines.length) {
      if (lines[closeIdx].trimStart().startsWith("```")) break;
      closeIdx++;
    }

    if (closeIdx >= lines.length) {
      console.error("[dnd-combat] No closing fence found! openIdx:", openIdx, "lines:", lines.length);
      return content;
    }

    console.log("[dnd-combat] Fence bounds: open=%d close=%d totalLines=%d", openIdx, closeIdx, lines.length);
    console.log("[dnd-combat] Opening fence line:", JSON.stringify(lines[openIdx]));
    console.log("[dnd-combat] Closing fence line:", JSON.stringify(lines[closeIdx]));

    const before = lines.slice(0, openIdx + 1);
    const after = lines.slice(closeIdx);
    const result = [...before, newYaml.trimEnd(), ...after].join("\n");

    console.log("[dnd-combat] Result preview:", result.slice(0, 300));
    return result;
  });
}

/** Debounced flush helper. Returns a function that debounces writes. */
export function createDebouncedFlush(
  app: App,
  delayMs = 500,
): {
  schedule: (
    file: TFile,
    sectionStart: number,
    sectionEnd: number,
    data: EncounterData,
  ) => void;
  cancel: () => void;
} {
  let timer: ReturnType<typeof setTimeout> | null = null;

  return {
    schedule(file, sectionStart, sectionEnd, data) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        flushToFile(app, file, sectionStart, sectionEnd, data);
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
