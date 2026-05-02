import type { CombatTag, TagTrigger } from "../types/encounter";
import type { CombatAction } from "../types/encounter";

/**
 * Auto-generate a CombatTag from SRD spell data.
 * Parses the description for trigger timing and builds a concise note
 * from the spell's save/damage/effect data.
 */
export function generateSpellTag(
  spell: CombatAction,
  casterId: string,
  targetIds: string[],
): CombatTag | null {
  const trigger = inferTrigger(spell.desc ?? "");

  // Only generate a target tag if there's an ongoing triggered effect.
  // Concentration alone doesn't warrant a target tag; that goes on the caster.
  if (!trigger) return null;

  const note = buildTagNote(spell, trigger);

  return {
    id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: spell.name,
    source: casterId,
    note,
    trigger,
    onTrigger: buildBannerReminder(spell, trigger),
    autoRemove: inferAutoRemove(spell),
  };
}

/**
 * Generate a concentration tag for the caster.
 */
export function generateConcentrationTag(
  spellName: string,
  casterId: string,
): CombatTag {
  return {
    id: `conc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: `Concentrating: ${spellName}`,
    source: casterId,
    note: `Concentration save on damage; drop ends ${spellName}`,
    trigger: "when_damaged",
    onTrigger: `CON save to maintain ${spellName}`,
    autoRemove: "on_save",
  };
}

/** Scan a spell description for trigger timing keywords. */
function inferTrigger(desc: string): TagTrigger | undefined {
  const lower = desc.toLowerCase();

  // "at the start of each of its turns" / "starts its turn"
  if (
    lower.includes("start of each of its turns") ||
    lower.includes("start of its turn") ||
    lower.includes("starts its turn") ||
    lower.includes("beginning of its turn") ||
    lower.includes("begins its turn")
  ) {
    return "start_of_turn";
  }

  // "at the end of each of its turns" / "ends its turn"
  if (
    lower.includes("end of each of its turns") ||
    lower.includes("end of its turn") ||
    lower.includes("ends its turn")
  ) {
    return "end_of_turn";
  }

  // "enters the area for the first time on a turn"
  if (
    lower.includes("enters the area") ||
    lower.includes("starts its turn in the area") ||
    lower.includes("starts its turn within")
  ) {
    return "start_of_turn";
  }

  return undefined;
}

/** Build a concise note from spell data. */
function buildNote(spell: CombatAction): string {
  const parts: string[] = [];

  if (spell.concentration) {
    parts.push("Concentration");
  }

  if (spell.saveStat) {
    const stat = spell.saveStat.toUpperCase();
    parts.push(`${stat} save`);
  }

  if (spell.dice && spell.damageType) {
    parts.push(`${spell.dice} ${spell.damageType}`);
  } else if (spell.damageType) {
    parts.push(spell.damageType);
  }

  if (spell.saveOnSuccess) {
    const outcome = spell.saveOnSuccess.toLowerCase();
    if (outcome.includes("half")) {
      parts.push("half on save");
    } else if (outcome.includes("none") || outcome.includes("negates")) {
      parts.push("negated on save");
    }
  }

  return parts.join("; ");
}

/**
 * Build the tag note (used in log parenthetical and banner detail).
 * Format: "start of turn: WIS save; 2d6 fire"
 */
function buildTagNote(spell: CombatAction, trigger: TagTrigger): string {
  const timingMap: Record<string, string> = {
    start_of_turn: "start of turn",
    end_of_turn: "end of turn",
    on_ally_turn: "on ally turn",
    on_enemy_turn: "on enemy turn",
    when_damaged: "when damaged",
  };
  const timing = timingMap[trigger] ?? trigger;

  const parts: string[] = [];

  if (spell.saveStat) {
    parts.push(`${spell.saveStat.toUpperCase()} save`);
  }

  if (spell.dice && spell.damageType) {
    parts.push(`${spell.dice} ${spell.damageType}`);
  }

  if (spell.saveOnSuccess) {
    const outcome = spell.saveOnSuccess.toLowerCase();
    if (outcome.includes("half")) {
      parts.push("half on save");
    }
  }

  if (parts.length > 0) {
    return `${timing}: ${parts.join("; ")}`;
  }

  return timing;
}

/**
 * Build the banner text shown when a trigger fires.
 * Format: "Start of turn: WIS save; 2d6 fire"
 */
function buildBannerReminder(spell: CombatAction, trigger: TagTrigger): string {
  const note = buildTagNote(spell, trigger);
  return note.charAt(0).toUpperCase() + note.slice(1);
}

/** Infer how the tag should be removed. */
function inferAutoRemove(spell: CombatAction): "on_save" | "on_source_end" | "manual" {
  if (spell.concentration) return "on_source_end";

  if (spell.saveOnSuccess) {
    const outcome = spell.saveOnSuccess.toLowerCase();
    if (outcome.includes("end") || outcome.includes("negat") || outcome.includes("none")) {
      return "on_save";
    }
  }

  return "manual";
}
