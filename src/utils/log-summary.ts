import type { EncounterState } from "../state/encounter-state.svelte";

/** Check if all targets in a list are the actor themselves. */
function isSelfOnly(actorId: string, targets: string[]): boolean {
  return targets.length > 0 && targets.every((t) => t === actorId);
}

/** Format a zone position like "above Bridge" or "South of Bridge". */
function formatZonePosition(
  pos: { id: string; preposition?: string } | null | undefined,
  encounter: EncounterState,
): string | null {
  if (!pos) return null;
  const zone = encounter.zones.find((z) => z.id === pos.id);
  const zoneName = zone?.name ?? pos.id;
  return pos.preposition ? `${pos.preposition} ${zoneName}` : zoneName;
}

/** Produce a human-readable summary of a log entry. Returns null for structural entries. */
export function summarizeLogEntry(entry: any, encounter: EncounterState): string | null {
  if (entry.attack) {
    const actorId = entry.attack.by;
    const actorName = encounter.getCombatant(actorId)?.name ?? actorId;
    const isSpell = !!entry.attack.spell;
    const isFailed = !!entry.attack.failed;
    const isResolved = !!entry.attack.resolved;
    const fromReadied = !!entry.attack.from_readied;
    const customVerb = entry.attack.verb;
    const tgtIds = (entry.attack.tgt ?? []).map((t: any) => t.who);
    const selfOnly = isSelfOnly(actorId, tgtIds);
    const allNoDamage = (entry.attack.tgt ?? []).every((t: any) => !t.dmg || t.dmg.length === 0);
    // Insert " (readied)" before the trailing period so readers see how the
    // action resolved. Skip resolved deferred effects (they're not the
    // commit-of-a-held-action; they fire on their own trigger).
    const wrap = (s: string) =>
      fromReadied && !isResolved ? s.replace(/\.\s*$/, " (readied).") : s;

    // Failed actions
    if (isFailed) {
      if (selfOnly) {
        return wrap(`${actorName} failed to use ${entry.attack.via}.`);
      }
      const targetNames = tgtIds.map((id: string) => encounter.getCombatant(id)?.name ?? id).join(", ");
      if (customVerb) {
        return wrap(`${actorName} fails to ${customVerb.replace(/s$/, "")} ${targetNames}.`);
      }
      if (isSpell) {
        return wrap(`${actorName} cast ${entry.attack.via} on ${targetNames}. Failed.`);
      }
      return wrap(`${actorName} missed ${targetNames} with ${entry.attack.via}.`);
    }

    const targetParts = (entry.attack.tgt ?? [])
      .map((t: any) => {
        const name = encounter.getCombatant(t.who)?.name ?? t.who;
        if (t.dmg && t.dmg.length > 0) {
          const dmgParts = t.dmg
            .map((d: any) => {
              // Compose: "{n} {type}[ ({source})][ ({mitigation})]". Source
              // and mitigation can co-occur (e.g. a Sneak Attack component
              // hitting a resistant target).
              const parts: string[] = [];
              if (d.source) parts.push(d.source);
              if (d.mitigation) parts.push(d.mitigation);
              const suffix = parts.length > 0 ? ` (${parts.join(", ")})` : "";
              return `${d.n} ${d.type}${suffix}`;
            })
            .join(" + ");
          return `${name} dealing ${dmgParts}`;
        }
        return name;
      })
      .join(", ");

    // Resolved deferred effect: "Moonbeam (Wex) affects Bandit 1 dealing 14 radiant."
    if (isResolved) {
      if (selfOnly) {
        return `${entry.attack.via} (${actorName}) resolves.`;
      }
      return `${entry.attack.via} (${actorName}) affects ${targetParts}.`;
    }

    // Self-targeted: drop "on [self]"
    if (selfOnly) {
      // Self-targeted with damage and a custom verb (rare): keep both.
      if (customVerb && !allNoDamage) return wrap(`${actorName} ${customVerb} ${entry.attack.via}.`);
      // Self-targeted spells: the cast itself is the action.
      if (isSpell) return wrap(`${actorName} cast ${entry.attack.via}.`);
      if (customVerb) {
        // Distinguish verbs that ARE the action name's gerund (Hide -> "hides",
        // Dodge -> "dodges"; drop the via) from generic verbs that describe a
        // way of performing a separately-named action (Twilight Sanctuary
        // verb "channels"; keep both). The verb-starts-with-name check
        // identifies the gerund case.
        const verbLower = customVerb.toLowerCase();
        const nameLower = (entry.attack.via ?? "").toLowerCase();
        if (nameLower && verbLower.startsWith(nameLower)) {
          return wrap(`${actorName} ${customVerb}.`);
        }
        return wrap(`${actorName} ${customVerb} ${entry.attack.via}.`);
      }
      return wrap(`${actorName} used ${entry.attack.via}.`);
    }

    if (customVerb) {
      return wrap(`${actorName} ${customVerb} ${targetParts}.`);
    }
    if (isSpell) {
      return wrap(`${actorName} cast ${entry.attack.via} on ${targetParts}.`);
    }
    if (allNoDamage) {
      return wrap(`${actorName} missed ${targetParts} with ${entry.attack.via}.`);
    }
    return wrap(`${actorName} attacked ${targetParts} with ${entry.attack.via}.`);
  }
  if (entry.heal) {
    const actorId = entry.heal.by;
    const actorName = encounter.getCombatant(actorId)?.name ?? actorId;
    const isResolved = !!entry.heal.resolved;
    const fromReadied = !!entry.heal.from_readied;
    const tgtIds = entry.heal.tgt.map((t: any) => t.who);
    const wrap = (s: string) =>
      fromReadied && !isResolved ? s.replace(/\.\s*$/, " (readied).") : s;

    if (isResolved) {
      const targets = entry.heal.tgt.map((t: any) => {
        const name = encounter.getCombatant(t.who)?.name ?? t.who;
        return `${name} for ${t.hp}`;
      }).join(", ");
      return `${entry.heal.via} (${actorName}) healed ${targets}.`;
    }

    if (isSelfOnly(actorId, tgtIds)) {
      const hp = entry.heal.tgt[0]?.hp ?? 0;
      return wrap(`${actorName} healed self for ${hp}.`);
    }
    const targets = entry.heal.tgt.map((t: any) => {
      const name = encounter.getCombatant(t.who)?.name ?? t.who;
      return `${name} for ${t.hp}`;
    }).join(", ");
    return wrap(`${actorName} healed ${targets}.`);
  }
  if (entry.condition) {
    const targets = entry.condition.tgt
      .map((id: string) => encounter.getCombatant(id)?.name ?? id)
      .join(", ");
    const conds = entry.condition.conditions.join(", ");
    return `${targets} ${entry.condition.tgt.length === 1 ? "is" : "are"} ${conds}.`;
  }
  if (entry.tag) {
    const actorId = entry.tag.by;
    const actorName = encounter.getCombatant(actorId)?.name ?? actorId;
    const tgtIds = entry.tag.tgt ?? [];
    const via = entry.tag.via;
    const viaSuffix = via ? ` (${via})` : "";
    const noteSuffix = entry.tag.note ? ` (${entry.tag.note})` : "";
    // Prefer the via attribution over the free-text note when both exist,
    // since via names the action/rider that produced the tag and reads
    // cleaner than a parenthetical reminder.
    const suffix = via ? viaSuffix : noteSuffix;

    if (isSelfOnly(actorId, tgtIds)) {
      // Setup entry that parallels effect_ends "X is no longer Y." Reads as
      // "Wex is now hidden (Cunning Hide)." instead of "Wex tags Wex ..."
      return `${actorName} is now ${entry.tag.name}${suffix}.`;
    }
    const targets = tgtIds
      .map((id: string) => encounter.getCombatant(id)?.name ?? id)
      .join(", ");
    return `${actorName} applies ${entry.tag.name} to ${targets}${suffix}.`;
  }
  if (entry.move) {
    const actorName = encounter.getCombatant(entry.move.by)?.name ?? entry.move.by;
    if (entry.move.fled) {
      return `${actorName} flees the encounter.`;
    }
    const fromLabel = formatZonePosition(entry.move.from, encounter);
    const toLabel = formatZonePosition(entry.move.to, encounter);
    if (fromLabel && toLabel) {
      return `${actorName} moves from ${fromLabel} to ${toLabel}.`;
    }
    if (toLabel) {
      return `${actorName} moves to ${toLabel}.`;
    }
    return `${actorName} moves.`;
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
    const effectName = entry.effect_ends.what;
    const targetName = encounter.getCombatant(entry.effect_ends.on)?.name ?? entry.effect_ends.on;
    if (entry.effect_ends.reason === "concentration_dropped") {
      return `${targetName} lost concentration on ${effectName}.`;
    }
    if (entry.effect_ends.reason === "action_consumed") {
      return `${targetName} is no longer ${effectName}.`;
    }
    return `${effectName} ended on ${targetName}.`;
  }
  if (entry.counter) {
    const counter = encounter.counters.find((c) => c.id === entry.counter.id);
    const counterName = counter?.name ?? entry.counter.id;
    const delta = entry.counter.delta;
    const sign = delta > 0 ? "+" : "";
    if (entry.counter.by) {
      const actorName = encounter.getCombatant(entry.counter.by)?.name ?? entry.counter.by;
      const via = entry.counter.via;
      return via
        ? `${actorName}'s ${via} ticks ${counterName} (${sign}${delta}).`
        : `${actorName} ticks ${counterName} (${sign}${delta}).`;
    }
    return `${counterName} ticks (${sign}${delta}).`;
  }
  if (entry.ack_rung) {
    const counter = encounter.counters.find((c) => c.id === entry.ack_rung.counter);
    const counterName = counter?.name ?? entry.ack_rung.counter;
    const rung = counter?.ladder?.[entry.ack_rung.rungIndex];
    if (entry.ack_rung.skipped) {
      const at = rung?.at != null ? ` ${rung.at}` : "";
      return `${counterName}${at} threshold dismissed.`;
    }
    const banner = (rung?.banner ?? "").trim();
    const at = rung?.at != null ? ` ${rung.at}` : "";
    return banner
      ? `${counterName}${at}: ${banner}`
      : `${counterName}${at} threshold reached.`;
  }
  if (entry.readied) {
    const actorName = encounter.getCombatant(entry.readied.by)?.name ?? entry.readied.by;
    const tgtNames = (entry.readied.tgt ?? [])
      .map((id: string) => encounter.getCombatant(id)?.name ?? id)
      .join(", ");
    const what = entry.readied.via || (entry.readied.isSpell ? "a spell" : "an action");
    const verb = entry.readied.isSpell ? "readies to cast" : "readies";
    if (tgtNames) {
      return `${actorName} ${verb} ${what} on ${tgtNames}.`;
    }
    return `${actorName} ${verb} ${what}.`;
  }
  if (entry.readied_expired) {
    const actorName = encounter.getCombatant(entry.readied_expired.by)?.name ?? entry.readied_expired.by;
    const what = entry.readied_expired.via;
    return `${actorName}'s readied ${what} was not used.`;
  }
  if (entry.death_save) {
    const name = encounter.getCombatant(entry.death_save.who)?.name ?? entry.death_save.who;
    switch (entry.death_save.kind) {
      case "downed":
        return `${name} is down (0 HP).`;
      case "pass":
        return `${name} makes a death save (success).`;
      case "fail":
        return `${name} fails a death save.`;
      case "crit_fail":
        return `${name} fails a death save (nat 1, two failures).`;
      case "dmg_fail":
        return `${name} takes damage while down (death-save failure).`;
      case "stabilized":
        return `${name} is stabilized.`;
      case "revived":
        return `${name} is back on their feet.`;
      case "dead":
        return `${name} dies.`;
    }
    return null;
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
