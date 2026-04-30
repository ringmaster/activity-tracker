<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";

  let { encounter, onClose }: {
    encounter: EncounterState;
    onClose: () => void;
  } = $props();

  let recentLog = $derived(encounter.log.slice(-15).reverse());

  function logSummary(entry: any): string {
    if (entry.start_combat) return `Combat started`;
    if (entry.end_combat) return `Combat ended`;
    if (entry.start_round) return `Round ${entry.start_round.n}`;
    if (entry.start_turn) return `${entry.start_turn.who}'s turn`;
    if (entry.attack) {
      const targets = entry.attack.tgt.map((t: any) => t.who).join(", ");
      return `${entry.attack.by} attacks ${targets} via ${entry.attack.via}`;
    }
    if (entry.heal) return `${entry.heal.by} heals ${entry.heal.tgt.map((t: any) => t.who).join(", ")}`;
    if (entry.buff) return `${entry.buff.by} buffs ${entry.buff.tgt.join(", ")} with ${entry.buff.via}`;
    if (entry.debuff) return `${entry.debuff.by} debuffs ${entry.debuff.tgt.join(", ")} with ${entry.debuff.via}`;
    if (entry.save) return `${entry.save.who} ${entry.save.result}s ${entry.save.stat} DC ${entry.save.dc}`;
    if (entry.note) return `${entry.note.by}: ${entry.note.text}`;
    if (entry.death) return `${entry.death.who} died`;
    if (entry.effect_ends) return `${entry.effect_ends.what} ends on ${entry.effect_ends.on}`;
    if (entry.add_combatant) return `${entry.add_combatant.name} joined`;
    if (entry.remove_combatant) return `${entry.remove_combatant.who} removed`;
    return JSON.stringify(entry);
  }
</script>

<div class="dnd-dropdown">
  <div class="dnd-dropdown-row" style="font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
    Initiative Order
  </div>
  {#each encounter.sortedCombatants as combatant (combatant.id)}
    <div
      class="dnd-dropdown-row"
      class:current={combatant.id === encounter.currentTurn}
    >
      <span style="width: 16px; font-weight: 700; color: var(--interactive-accent);">
        {combatant.id === encounter.currentTurn ? "\u25B6" : ""}
      </span>
      <span class="dnd-combatant-name">
        {combatant.name}
        {#if combatant.conditions.includes("dead")}
          <span class="dnd-combatant-tag">DEAD</span>
        {/if}
      </span>
      <span style="font-size: 12px; color: var(--text-muted); width: 40px; text-align: right;">
        {combatant.init ?? "-"}
      </span>
      <span style="font-size: 12px; width: 64px; text-align: right;">
        {#if combatant.type === "npc" && combatant.hp}
          {combatant.hp.current}/{combatant.hp.max}
        {:else if combatant.type === "pc"}
          dmg {combatant.damage_taken ?? 0}
        {/if}
      </span>
    </div>
  {/each}

  {#if recentLog.length > 0}
    <div class="dnd-dropdown-row" style="font-size: 12px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px;">
      Recent Log
    </div>
    {#each recentLog as entry, idx (idx)}
      <div class="dnd-dropdown-row" style="font-size: 13px; color: var(--text-muted);">
        {logSummary(entry)}
      </div>
    {/each}
  {/if}

  <div class="dnd-dropdown-row" style="justify-content: flex-end;">
    <button class="dnd-bar-btn" onclick={onClose}>Close</button>
  </div>
</div>
