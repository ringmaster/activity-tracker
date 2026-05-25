<script lang="ts">
  import type { Combatant, Zone } from "../../types/encounter";
  import { CONDITION_DESCRIPTIONS } from "../../utils/condition-descriptions";
  import { renderSpellDescription } from "../../utils/spell-renderer";

  let { combatant, isCurrent = false, isSwapped = false, onSelect, showZone = false, zones }: {
    combatant: Combatant;
    isCurrent?: boolean;
    /** True when the dropdown has manually swapped the active actor to this
     *  combatant (i.e. encounter.swappedActor === combatant.id and the
     *  actor differs from currentTurn). Renders an outlined caret distinct
     *  from the solid current-turn caret. Mutually exclusive with isCurrent. */
    isSwapped?: boolean;
    /** When provided, the row becomes tappable and invokes this with the
     *  combatant id. Used by the actor dropdown's swap list. */
    onSelect?: (id: string) => void;
    /** Swap the init column for a zone column. */
    showZone?: boolean;
    /** Zones to resolve zone.id to a display name. Only consulted when
     *  showZone is true. */
    zones?: Zone[];
  } = $props();

  let isDead = $derived(combatant.conditions.includes("dead"));
  let isFled = $derived(combatant.conditions.includes("fled"));

  let expandedCondition = $state<string | null>(null);

  function toggleCondition(cond: string) {
    expandedCondition = expandedCondition === cond ? null : cond;
  }

  function renderCondition(el: HTMLElement, cond: string) {
    renderSpellDescription(el, CONDITION_DESCRIPTIONS[cond] ?? "");
    return {
      update(newCond: string) {
        renderSpellDescription(el, CONDITION_DESCRIPTIONS[newCond] ?? "");
      },
    };
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

  /** Resolve a zone id to its display name; falls back to the id if no zones
   *  array was provided. */
  let zoneDisplay = $derived.by(() => {
    if (!combatant.zone?.id) return "-";
    const z = zones?.find((zone) => zone.id === combatant.zone?.id);
    return z?.name ?? combatant.zone.id;
  });

  /** Visible conditions = everything except the dead/fled special cases,
   *  which get their own DEAD/FLED tags. */
  let visibleConditions = $derived(
    (combatant.conditions ?? []).filter((c) => c !== "dead" && c !== "fled"),
  );

  /** True when at least one status pill (DEAD/FLED, condition, tag) is
   *  showing. Suppresses class_level when true, per the design that pills
   *  and class_level fill the same slot. */
  let hasStatus = $derived(
    isDead ||
      isFled ||
      visibleConditions.length > 0 ||
      (combatant.tags?.length ?? 0) > 0,
  );

  function handleClick() {
    if (onSelect) onSelect(combatant.id);
  }

  function handleKey(e: KeyboardEvent) {
    if (!onSelect) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(combatant.id);
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<li
  class="dnd-combatant-row"
  class:current={isCurrent}
  class:dead={isDead}
  class:fled={isFled}
  class:clickable={!!onSelect}
  onclick={onSelect ? handleClick : undefined}
  onkeydown={onSelect ? handleKey : undefined}
  tabindex={onSelect ? 0 : undefined}
>
  <span class="dnd-combatant-caret" class:swapped={!isCurrent && isSwapped}>{isCurrent ? "▶" : isSwapped ? "▷" : ""}</span>
  <span class="dnd-combatant-name">
    {combatant.name}
    {#if isDead}
      <span class="dnd-combatant-tag">DEAD</span>
    {:else if isFled}
      <span class="dnd-combatant-tag fled">FLED</span>
    {/if}
    {#each visibleConditions as cond}
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
    {#if !hasStatus && combatant.class_level}
      <span class="dnd-combatant-class-level">{combatant.class_level}</span>
    {/if}
  </span>
  {#if showZone}
    <span class="dnd-combatant-zone">{zoneDisplay}</span>
  {:else}
    <span class="dnd-combatant-init">{initDisplay}</span>
  {/if}
  <span class="dnd-combatant-ac">{acDisplay}</span>
  <span class="dnd-combatant-hp" class:bloodied={isBloodied}>{hpDisplay}</span>
</li>
{#if expandedCondition && CONDITION_DESCRIPTIONS[expandedCondition]}
  <li class="dnd-condition-desc" use:renderCondition={expandedCondition}></li>
{/if}
