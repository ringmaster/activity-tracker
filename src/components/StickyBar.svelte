<script lang="ts">
  import type { EncounterState } from "../state/encounter-state.svelte";
  import { checkObligations } from "../state/obligation-engine.svelte";
  import type { ObligationBannerData } from "../state/obligation-engine.svelte";
  import DefaultBar from "./bar/DefaultBar.svelte";
  import ActionBar from "./bar/ActionBar.svelte";
  import BannerStack from "./banners/BannerStack.svelte";

  let { encounter }: { encounter: EncounterState } = $props();

  // Derive banners directly from encounter state
  let activeBanners = $derived.by(() => {
    if (!encounter.active || !encounter.currentTurn) return [];

    const banners: ObligationBannerData[] = [];
    banners.push(...checkObligations(encounter, "start_of_turn", encounter.currentTurn));
    banners.push(...checkObligations(encounter, "end_of_turn", encounter.currentTurn));
    banners.push(...checkObligations(encounter, "start_of_round"));
    banners.push(...checkObligations(encounter, "when_damaged"));
    return banners;
  });

  // Derive the current turn's action log entries (everything after the last start_turn)
  // Show actions from the current actor's most recent start_turn to
  // the next start_turn (or end of log). Navigating back with the
  // arrow changes currentTurn, so the log follows.
  let turnLog = $derived.by(() => {
    const log = encounter.log;
    const who = encounter.currentTurn;
    if (log.length === 0 || !who) return [];

    // Find the last start_turn for the current actor
    let turnStartIdx = -1;
    for (let i = log.length - 1; i >= 0; i--) {
      const entry = log[i] as any;
      if (entry.start_turn && entry.start_turn.who === who) {
        turnStartIdx = i;
        break;
      }
    }
    if (turnStartIdx < 0) return [];

    // Collect entries from after start_turn until the next start_turn or end of log
    const entries: string[] = [];
    for (let i = turnStartIdx + 1; i < log.length; i++) {
      if ("start_turn" in log[i]) break;
      const summary = summarizeLogEntry(log[i]);
      if (summary) entries.push(summary);
    }
    return entries;
  });

  function summarizeLogEntry(entry: any): string | null {
    if (entry.attack) {
      const actorName = encounter.getCombatant(entry.attack.by)?.name ?? entry.attack.by;
      const allMiss = entry.attack.tgt.every((t: any) => !t.dmg || t.dmg.length === 0);
      const targets = entry.attack.tgt
        .map((t: any) => {
          const name = encounter.getCombatant(t.who)?.name ?? t.who;
          if (t.dmg && t.dmg.length > 0) {
            const dmgParts = t.dmg.map((d: any) => `${d.n} ${d.type}`).join(" + ");
            return `${name} dealing ${dmgParts}`;
          }
          return name;
        })
        .join(", ");
      if (allMiss) {
        return `${actorName} missed ${targets} with ${entry.attack.via}.`;
      }
      return `${actorName} attacked ${targets} with ${entry.attack.via}.`;
    }
    if (entry.heal) {
      const actorName = encounter.getCombatant(entry.heal.by)?.name ?? entry.heal.by;
      const targets = entry.heal.tgt.map((t: any) => {
        const name = encounter.getCombatant(t.who)?.name ?? t.who;
        return `${name} for ${t.hp}`;
      }).join(", ");
      return `${actorName} healed ${targets}.`;
    }
    if (entry.buff) {
      const actorName = encounter.getCombatant(entry.buff.by)?.name ?? entry.buff.by;
      const targets = entry.buff.tgt.map((id: string) => encounter.getCombatant(id)?.name ?? id).join(", ");
      return `${actorName} cast ${entry.buff.via} on ${targets}.`;
    }
    if (entry.debuff) {
      const actorName = encounter.getCombatant(entry.debuff.by)?.name ?? entry.debuff.by;
      const targets = entry.debuff.tgt.map((id: string) => encounter.getCombatant(id)?.name ?? id).join(", ");
      return `${actorName} applied ${entry.debuff.via} to ${targets}.`;
    }
    if (entry.save) {
      const name = encounter.getCombatant(entry.save.who)?.name ?? entry.save.who;
      return `${name} ${entry.save.result === "pass" ? "passed" : "failed"} ${entry.save.stat.toUpperCase()} DC ${entry.save.dc}.`;
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
    return null;
  }

  let isActionActive = $derived(encounter.activeAction !== null);
  let combatOver = $derived(encounter.allNPCsDead);
</script>

{#if combatOver}
  <div class="dnd-bar">
    <div class="dnd-combat-over">Combat Over!</div>
  </div>
{:else if isActionActive}
  <ActionBar {encounter} />
{:else}
  <DefaultBar {encounter} />
{/if}

{#if turnLog.length > 0}
  <div class="dnd-turn-log">
    {#each turnLog as line}
      <div class="dnd-turn-log-entry">&raquo; {line}</div>
    {/each}
  </div>
{/if}

<BannerStack banners={activeBanners} {encounter} />
