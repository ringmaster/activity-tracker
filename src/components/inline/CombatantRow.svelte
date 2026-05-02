<script lang="ts">
  import type { Combatant } from "../../types/encounter";
  import { CONDITION_DESCRIPTIONS } from "../../utils/condition-descriptions";
  import { renderSpellDescription } from "../../utils/spell-renderer";

  let { combatant, isCurrent = false }: { combatant: Combatant; isCurrent?: boolean } = $props();

  let isDead = $derived(combatant.conditions.includes("dead"));
  let isFled = $derived(combatant.conditions.includes("fled"));

  let expandedCondition = $state<string | null>(null);

  function toggleCondition(cond: string) {
    expandedCondition = expandedCondition === cond ? null : cond;
  }

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
  class:fled={isFled}
>
  <span class="dnd-combatant-caret">{isCurrent ? "\u25B6" : ""}</span>
  <span class="dnd-combatant-name">
    {combatant.name}
    {#if isDead}
      <span class="dnd-combatant-tag">DEAD</span>
    {:else if isFled}
      <span class="dnd-combatant-tag fled">FLED</span>
    {/if}
    {#each (combatant.conditions ?? []).filter(c => c !== "dead" && c !== "fled") as cond}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <span
        class="dnd-condition-chip"
        class:expanded={expandedCondition === cond}
        onclick={() => toggleCondition(cond)}
      >{cond}</span>
    {/each}
    {#each (combatant.tags ?? []) as tag (tag.id)}
      <span class="dnd-tag-chip" title={tag.note ?? ""}>{tag.name}</span>
    {/each}
  </span>
  <span class="dnd-combatant-init">{initDisplay}</span>
  <span class="dnd-combatant-ac">{acDisplay}</span>
  <span class="dnd-combatant-hp" class:bloodied={isBloodied}>{hpDisplay}</span>
</li>
{#if expandedCondition && CONDITION_DESCRIPTIONS[expandedCondition]}
  <li class="dnd-condition-desc">
    {CONDITION_DESCRIPTIONS[expandedCondition]}
  </li>
{/if}
