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

  let npcs = $derived(encounter.sortedCombatants.filter((c) => c.type === "npc"));
  let pcs = $derived(encounter.sortedCombatants.filter((c) => c.type === "pc"));

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

<div class="dnd-dropdown">
  {#if npcs.length > 0}
    <div class="dnd-dropdown-section-header">NPCs</div>
    {#each npcs as combatant (combatant.id)}
      {@const sel = selected[combatant.id]}
      {#if sel}
        {@const hint = getResistanceHint(combatant.id)}
        <div class="dnd-target-row">
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
            {#if combatant.hp}
              <span class="dnd-target-hp">{combatant.hp.current}/{combatant.hp.max}</span>
            {/if}
            {#if combatant.conditions.includes("dead")}
              <span class="dnd-combatant-tag">DEAD</span>
            {/if}
          </button>

          {#if hint}
            <span class="dnd-target-hint {hint.className}">{hint.label}</span>
          {/if}

          {#if sel.checked}
            <div class="dnd-outcome-radios">
              <button
                class="dnd-outcome-radio"
                class:selected={sel.outcome === "full"}
                onclick={() => setOutcome(combatant.id, "full")}
              >Hit</button>
              <button
                class="dnd-outcome-radio"
                class:selected={sel.outcome === "half"}
                onclick={() => setOutcome(combatant.id, "half")}
              >Half</button>
              <button
                class="dnd-outcome-radio"
                class:selected={sel.outcome === "zero"}
                onclick={() => setOutcome(combatant.id, "zero")}
              >Zero</button>
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  {/if}

  {#if pcs.length > 0}
    <div class="dnd-dropdown-section-header">Party</div>
    {#each pcs as combatant (combatant.id)}
      {@const sel = selected[combatant.id]}
      {#if sel}
        <div class="dnd-target-row dnd-target-pc">
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
            {#if (combatant.damage_taken ?? 0) > 0}
              <span class="dnd-target-hp">dmg {combatant.damage_taken}</span>
            {/if}
            {#if combatant.conditions.includes("dead")}
              <span class="dnd-combatant-tag">DEAD</span>
            {/if}
          </button>

          {#if sel.checked}
            <div class="dnd-outcome-radios">
              <button
                class="dnd-outcome-radio"
                class:selected={sel.outcome === "full"}
                onclick={() => setOutcome(combatant.id, "full")}
              >Hit</button>
              <button
                class="dnd-outcome-radio"
                class:selected={sel.outcome === "half"}
                onclick={() => setOutcome(combatant.id, "half")}
              >Half</button>
              <button
                class="dnd-outcome-radio"
                class:selected={sel.outcome === "zero"}
                onclick={() => setOutcome(combatant.id, "zero")}
              >Zero</button>
            </div>
          {/if}
        </div>
      {/if}
    {/each}
  {/if}

  <div class="dnd-dropdown-row" style="justify-content: flex-end;">
    <button class="dnd-bar-btn" onclick={onClose}>Done</button>
  </div>
</div>
