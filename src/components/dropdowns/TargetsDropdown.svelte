<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";

  let {
    encounter,
    selected = $bindable<Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }>>({}),
    onClose,
    damageType,
  }: {
    encounter: EncounterState;
    selected: Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }>;
    onClose?: () => void;
    damageType?: string;
  } = $props();

  // Initialize selection state for all combatants if not already set
  $effect(() => {
    for (const c of encounter.sortedCombatants) {
      if (!(c.id in selected)) {
        selected[c.id] = { checked: false, outcome: "full" };
      }
    }
  });

  let actorType = $derived(encounter.effectiveActor?.type ?? "pc");

  function alphaSort(a: { name: string }, b: { name: string }) {
    return a.name.localeCompare(b.name);
  }

  let npcs = $derived(
    encounter.combatants.filter((c) => c.type === "npc").sort(alphaSort),
  );
  let pcs = $derived(
    encounter.combatants.filter((c) => c.type === "pc").sort(alphaSort),
  );

  // Enemies first, friendlies second (relative to the actor)
  let enemyGroup = $derived(actorType === "pc" ? npcs : pcs);
  let friendlyGroup = $derived(actorType === "pc" ? pcs : npcs);
  let enemyLabel = $derived(actorType === "pc" ? "NPCs" : "Party");
  let friendlyLabel = $derived(actorType === "pc" ? "Party" : "NPCs");

  function toggleTarget(id: string) {
    if (selected[id]) {
      selected[id].checked = !selected[id].checked;
    }
  }

  function selectSingle(id: string) {
    for (const key of Object.keys(selected)) {
      selected[key].checked = key === id;
    }
    onClose?.();
  }

  function setOutcome(id: string, outcome: "full" | "half" | "zero") {
    if (selected[id]) {
      selected[id].outcome = outcome;
    }
  }

  function getResistanceHint(combatantId: string): { label: string; className: string } | null {
    if (!damageType) return null;
    const c = encounter.getCombatant(combatantId);
    if (!c || c.type !== "npc") return null;
    return null;
  }
</script>

{#snippet targetRow(combatant: typeof encounter.combatants[0])}
  {@const sel = selected[combatant.id]}
  {#if sel}
    <div class="dnd-target-row" class:dnd-target-pc={combatant.type === "pc"}>
      <input
        type="checkbox"
        class="dnd-target-checkbox"
        checked={sel.checked}
        onchange={() => toggleTarget(combatant.id)}
      />
      <button
        class="dnd-target-name"
        onclick={() => selectSingle(combatant.id)}
      >
        {combatant.name}
        {#if combatant.type === "npc" && combatant.hp}
          <span class="dnd-target-hp">{combatant.hp.current}/{combatant.hp.max}</span>
        {:else if combatant.type === "pc" && (combatant.damage_taken ?? 0) > 0}
          <span class="dnd-target-hp">dmg {combatant.damage_taken}</span>
        {/if}
        {#if (combatant.conditions ?? []).includes("dead")}
          <span class="dnd-combatant-tag">DEAD</span>
        {/if}
      </button>

      {#if sel.checked}
        <div class="dnd-outcome-radios">
          <button class="dnd-outcome-radio" class:selected={sel.outcome === "full"} onclick={() => setOutcome(combatant.id, "full")}>Hit</button>
          <button class="dnd-outcome-radio" class:selected={sel.outcome === "half"} onclick={() => setOutcome(combatant.id, "half")}>Half</button>
          <button class="dnd-outcome-radio" class:selected={sel.outcome === "zero"} onclick={() => setOutcome(combatant.id, "zero")}>Zero</button>
        </div>
      {/if}
    </div>
  {/if}
{/snippet}

<div class="dnd-dropdown">
  {#if enemyGroup.length > 0}
    <div class="dnd-dropdown-section-header">{enemyLabel}</div>
    {#each enemyGroup as combatant (combatant.id)}
      {@render targetRow(combatant)}
    {/each}
  {/if}

  {#if friendlyGroup.length > 0}
    <div class="dnd-dropdown-section-header">{friendlyLabel}</div>
    {#each friendlyGroup as combatant (combatant.id)}
      {@render targetRow(combatant)}
    {/each}
  {/if}

  <div class="dnd-dropdown-row" style="justify-content: flex-end;">
    <button class="dnd-bar-btn" onclick={onClose}>Done</button>
  </div>
</div>
