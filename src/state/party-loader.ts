import yaml from "js-yaml";
import type { App, TFile } from "obsidian";
import type { Party, PartyData, PartyMember, PartyAction } from "../types/party";

/**
 * Load the party roster + named party groups from the configured party note.
 * Tries (in order) bare YAML, the first ```yaml code block, and frontmatter.
 * Returns empty members + empty parties when the file is missing or none
 * of the formats parse to a `party` array.
 */
export async function loadPartyData(
  app: App,
  partyNotePath: string,
): Promise<{ members: PartyMember[]; parties: Party[] }> {
  const file = app.vault.getAbstractFileByPath(partyNotePath);
  if (!file || !("extension" in file)) return { members: [], parties: [] };

  const content = await app.vault.read(file as TFile);
  const parsed = parsePartyData(content);
  if (!parsed) return { members: [], parties: [] };

  const members = parsed.party ?? [];
  const memberIds = new Set(members.map((m) => m.id));
  const parties = (parsed.parties ?? [])
    .filter((p): p is Party => !!p && typeof p.name === "string" && Array.isArray(p.members))
    .map((p) => ({
      name: p.name,
      // Drop ids that don't resolve so a stale party reference can't show a
      // ghost row at encounter start.
      members: p.members.filter((id) => memberIds.has(id)),
    }));

  return { members, parties };
}

/** Back-compat wrapper kept for call sites that only need the roster. */
export async function loadParty(
  app: App,
  partyNotePath: string,
): Promise<PartyMember[]> {
  const { members } = await loadPartyData(app, partyNotePath);
  return members;
}

/** Try each supported container format; return the first one that yields a
 *  party array. Returns null when nothing parses. */
function parsePartyData(content: string): PartyData | null {
  try {
    const parsed = yaml.load(content) as PartyData;
    if (parsed?.party && Array.isArray(parsed.party)) return parsed;
  } catch { /* fall through */ }

  const blockMatch = content.match(/```ya?ml\s*\n([\s\S]*?)```/);
  if (blockMatch) {
    try {
      const parsed = yaml.load(blockMatch[1]) as PartyData;
      if (parsed?.party && Array.isArray(parsed.party)) return parsed;
    } catch { /* fall through */ }
  }

  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (fmMatch) {
    try {
      const parsed = yaml.load(fmMatch[1]) as PartyData;
      if (parsed?.party && Array.isArray(parsed.party)) return parsed;
    } catch { /* fall through */ }
  }

  return null;
}

/**
 * Update a party member's learned actions/spells in the party note file.
 * Reads the file, finds the member by id, merges new entries, writes back.
 */
export async function updatePartyMember(
  app: App,
  partyNotePath: string,
  memberId: string,
  newActions?: (string | PartyAction)[],
  newSpells?: string[],
): Promise<void> {
  const file = app.vault.getAbstractFileByPath(partyNotePath);
  if (!file || !("extension" in file)) return;

  const content = await app.vault.read(file as TFile);

  // Detect which format the party data is in and extract it
  let partyData: PartyData | null = null;
  let format: "bare" | "codeblock" | "frontmatter" = "bare";
  let blockMatch: RegExpMatchArray | null = null;
  let fmMatch: RegExpMatchArray | null = null;

  // Try bare YAML
  try {
    const parsed = yaml.load(content) as PartyData;
    if (parsed?.party && Array.isArray(parsed.party)) {
      partyData = parsed;
      format = "bare";
    }
  } catch { /* not bare YAML */ }

  // Try code block
  if (!partyData) {
    blockMatch = content.match(/```ya?ml\s*\n([\s\S]*?)```/);
    if (blockMatch) {
      try {
        const parsed = yaml.load(blockMatch[1]) as PartyData;
        if (parsed?.party && Array.isArray(parsed.party)) {
          partyData = parsed;
          format = "codeblock";
        }
      } catch { /* malformed */ }
    }
  }

  // Try frontmatter
  if (!partyData) {
    fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/);
    if (fmMatch) {
      try {
        const parsed = yaml.load(fmMatch[1]) as PartyData;
        if (parsed?.party && Array.isArray(parsed.party)) {
          partyData = parsed;
          format = "frontmatter";
        }
      } catch { /* malformed */ }
    }
  }

  if (!partyData) return;

  // Find the member
  const member = partyData.party.find((m) => m.id === memberId);
  if (!member) return;

  let changed = false;

  // Merge new actions (strings are library references, objects are inline)
  if (newActions) {
    if (!member.actions) member.actions = [];
    for (const action of newActions) {
      const actionName = typeof action === "string" ? action : action.name;
      const exists = member.actions.some((a) => {
        const name = typeof a === "string" ? a : a.name;
        return name.toLowerCase() === actionName.toLowerCase();
      });
      if (!exists) {
        member.actions.push(action as any);
        changed = true;
      }
    }
  }

  // Merge new spells (stored on the member as a spells array of strings)
  if (newSpells) {
    const memberAny = member as any;
    if (!memberAny.spells) memberAny.spells = [];
    for (const spell of newSpells) {
      const exists = memberAny.spells.some(
        (s: string) => s.toLowerCase() === spell.toLowerCase(),
      );
      if (!exists) {
        memberAny.spells.push(spell);
        changed = true;
      }
    }
  }

  if (!changed) return;

  // Serialize and write back
  const newYaml = yaml.dump(partyData, {
    lineWidth: -1,
    noRefs: true,
    sortKeys: false,
  });

  if (format === "bare") {
    await app.vault.modify(file as TFile, newYaml);
  } else if (format === "codeblock" && blockMatch) {
    const langTag = content.match(/```(ya?ml)\s*\n/)?.[0] ?? "```yaml\n";
    const updated = content.replace(
      blockMatch[0],
      langTag + newYaml.trimEnd() + "\n```",
    );
    await app.vault.modify(file as TFile, updated);
  } else if (format === "frontmatter" && fmMatch) {
    const updated = content.replace(
      fmMatch[0],
      "---\n" + newYaml.trimEnd() + "\n---",
    );
    await app.vault.modify(file as TFile, updated);
  }
}
