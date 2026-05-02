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

  let actor = $derived(encounter.effectiveActor);

  function alphaSort(a: { name: string }, b: { name: string }) {
    return a.name.localeCompare(b.name);
  }

  /** Is this combatant on the same side as the actor? */
  function isFriendly(c: typeof encounter.combatants[0]): boolean {
    // PCs are friendly to PCs (and to friendly NPCs)
    // NPCs are friendly to NPCs (and to hostile PCs, if that ever exists)
    // The `friendly` flag flips the default allegiance
    if (c.type === "pc") return actor?.type === "pc" ? !c.friendly : !!c.friendly;
    if (c.type === "npc") return actor?.type === "npc" ? !c.friendly : !!c.friendly;
    return false;
  }

  // Group combatants by allegiance relative to the actor, sorted alphabetically
  let enemyGroup = $derived(
    (encounter.combatants ?? []).filter((c) => !isFriendly(c)).sort(alphaSort),
  );
  let friendlyGroup = $derived(
    (encounter.combatants ?? []).filter((c) => isFriendly(c)).sort(alphaSort),
  );
  let enemyLabel = $derived(actor?.type === "pc" ? "Enemies" : "Targets");
  let friendlyLabel = $derived(actor?.type === "pc" ? "Allies" : "Allies");

  function toggleFriendly(id: string) {
    const c = encounter.getCombatant(id);
    if (!c) return;
    c.friendly = !c.friendly;
    encounter.flush();
  }

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
        class="dnd-friendly-toggle"
        title={isFriendly(combatant) ? "Ally (tap to mark hostile)" : "Enemy (tap to mark friendly)"}
        onclick={() => toggleFriendly(combatant.id)}
      >{isFriendly(combatant) ? "\u{1F6E1}" : "\u2694"}</button>
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
