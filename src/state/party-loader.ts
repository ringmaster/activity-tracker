import yaml from "js-yaml";
import type { App, TFile } from "obsidian";
import type { PartyData, PartyMember } from "../types/party";

/**
 * Load the party roster from the configured party note.
 * The note should contain a YAML code block or frontmatter with a `party` array.
 */
export async function loadParty(
  app: App,
  partyNotePath: string,
): Promise<PartyMember[]> {
  const file = app.vault.getAbstractFileByPath(partyNotePath);
  if (!file || !("extension" in file)) return [];

  const content = await app.vault.read(file as TFile);

  // Try parsing the whole file as YAML first (bare YAML file)
  try {
    const parsed = yaml.load(content) as PartyData;
    if (parsed?.party && Array.isArray(parsed.party)) {
      return parsed.party;
    }
  } catch {
    // Not a bare YAML file; try extracting from a code block
  }

  // Try extracting from a ```yaml code block
  const yamlBlockMatch = content.match(
    /```ya?ml\s*\n([\s\S]*?)```/,
  );
  if (yamlBlockMatch) {
    try {
      const parsed = yaml.load(yamlBlockMatch[1]) as PartyData;
      if (parsed?.party && Array.isArray(parsed.party)) {
        return parsed.party;
      }
    } catch {
      // Malformed YAML
    }
  }

  // Try frontmatter
  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    try {
      const parsed = yaml.load(fmMatch[1]) as PartyData;
      if (parsed?.party && Array.isArray(parsed.party)) {
        return parsed.party;
      }
    } catch {
      // Malformed frontmatter
    }
  }

  return [];
}
