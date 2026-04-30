<script lang="ts">
  import type { Combatant } from "../../types/encounter";

  let { combatant, isCurrent = false }: { combatant: Combatant; isCurrent?: boolean } = $props();

  let isDead = $derived(combatant.conditions.includes("dead"));

  let hpDisplay = $derived.by(() => {
    if (combatant.type === "npc" && combatant.hp) {
      return `${combatant.hp.current}/${combatant.hp.max}`;
    }
    if (combatant.type === "pc") {
      return String(combatant.damage_taken ?? 0);
    }
    return "";
  });

  let isBloodied = $derived(
    combatant.type === "npc" &&
      combatant.hp != null &&
      combatant.hp.max > 0 &&
      combatant.hp.current <= combatant.hp.max / 2 &&
      combatant.hp.current > 0,
  );

  let initDisplay = $derived(
    combatant.init !== null && combatant.init !== undefined
      ? String(combatant.init)
      : "-",
  );

  let acDisplay = $derived(
    combatant.ac != null ? String(combatant.ac) : "-",
  );
</script>

<li
  class="dnd-combatant-row"
  class:current={isCurrent}
  class:dead={isDead}
>
  <span class="dnd-combatant-caret">{isCurrent ? "\u25B6" : ""}</span>
  <span class="dnd-combatant-name">
    {combatant.name}
    {#if isDead}
      <span class="dnd-combatant-tag">DEAD</span>
    {/if}
    {#each combatant.conditions.filter(c => c !== "dead") as cond}
      <span class="dnd-condition-chip">{cond}</span>
    {/each}
  </span>
  <span class="dnd-combatant-init">{initDisplay}</span>
  <span class="dnd-combatant-ac">{acDisplay}</span>
  <span class="dnd-combatant-hp" class:bloodied={isBloodied}>{hpDisplay}</span>
</li>
