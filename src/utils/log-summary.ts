import type { EncounterState } from "../state/encounter-state.svelte";

/** Produce a human-readable summary of a log entry. Returns null for structural entries. */
export function summarizeLogEntry(entry: any, encounter: EncounterState): string | null {
  if (entry.attack) {
    const actorName = encounter.getCombatant(entry.attack.by)?.name ?? entry.attack.by;
    const isSpell = !!entry.attack.spell;
    const isFailed = !!entry.attack.failed;
    const allNoDamage = entry.attack.tgt.every((t: any) => !t.dmg || t.dmg.length === 0);

    const targetNames = entry.attack.tgt
      .map((t: any) => encounter.getCombatant(t.who)?.name ?? t.who)
      .join(", ");

    if (isFailed) {
      if (isSpell) {
        return `${actorName} cast ${entry.attack.via} on ${targetNames}. Failed.`;
      }
      return `${actorName} missed ${targetNames} with ${entry.attack.via}.`;
    }

    const targetParts = entry.attack.tgt
      .map((t: any) => {
        const name = encounter.getCombatant(t.who)?.name ?? t.who;
        if (t.dmg && t.dmg.length > 0) {
          const dmgParts = t.dmg.map((d: any) => `${d.n} ${d.type}`).join(" + ");
          return `${name} dealing ${dmgParts}`;
        }
        return name;
      })
      .join(", ");

    if (isSpell) {
      return `${actorName} cast ${entry.attack.via} on ${targetParts}.`;
    }
    if (allNoDamage) {
      return `${actorName} missed ${targetParts} with ${entry.attack.via}.`;
    }
    return `${actorName} attacked ${targetParts} with ${entry.attack.via}.`;
  }
  if (entry.heal) {
    const actorName = encounter.getCombatant(entry.heal.by)?.name ?? entry.heal.by;
    const targets = entry.heal.tgt.map((t: any) => {
      const name = encounter.getCombatant(t.who)?.name ?? t.who;
      return `${name} for ${t.hp}`;
    }).join(", ");
    return `${actorName} healed ${targets}.`;
  }
  if (entry.condition) {
    const targets = entry.condition.tgt
      .map((id: string) => encounter.getCombatant(id)?.name ?? id)
      .join(", ");
    const conds = entry.condition.conditions.join(", ");
    return `${targets} ${entry.condition.tgt.length === 1 ? "is" : "are"} ${conds}.`;
  }
  if (entry.tag) {
    const actorName = encounter.getCombatant(entry.tag.by)?.name ?? entry.tag.by;
    const targets = entry.tag.tgt
      .map((id: string) => encounter.getCombatant(id)?.name ?? id)
      .join(", ");
    return `${actorName} tags ${targets} with ${entry.tag.name}${entry.tag.note ? ` (${entry.tag.note})` : ""}.`;
  }
  if (entry.move) {
    const actorName = encounter.getCombatant(entry.move.by)?.name ?? entry.move.by;
    const targetName = entry.move.target
      ? encounter.getCombatant(entry.move.target)?.name ?? entry.move.target
      : null;
    if (entry.move.verb === "flees") {
      return targetName
        ? `${actorName} flees from ${targetName}.`
        : `${actorName} flees from the encounter.`;
    }
    return targetName
      ? `${actorName} ${entry.move.verb} ${targetName}.`
      : `${actorName} ${entry.move.verb} the encounter.`;
  }
  if (entry.note) {
    const actorName = encounter.getCombatant(entry.note.by)?.name ?? entry.note.by;
    return `${actorName}: ${entry.note.text}`;
  }
  if (entry.death) {
    const name = encounter.getCombatant(entry.death.who)?.name ?? entry.death.who;
    return `${name} died.`;
  }
  if (entry.effect_ends) {
    return `${entry.effect_ends.what} ended on ${encounter.getCombatant(entry.effect_ends.on)?.name ?? entry.effect_ends.on}.`;
  }
  if (entry.start_round) {
    return `--- Round ${entry.start_round.n} ---`;
  }
  if (entry.start_turn) {
    const name = encounter.getCombatant(entry.start_turn.who)?.name ?? entry.start_turn.who;
    return `${name}'s turn`;
  }
  return null;
}
