<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";

  let {
    encounter,
    selected = $bindable<Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }>>({}),
    onClose,
    onAddTarget,
    damageType,
  }: {
    encounter: EncounterState;
    selected: Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }>;
    onClose?: () => void;
    onAddTarget?: () => void;
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
    if (c.type === "pc") return actor?.type === "pc" ? !c.friendly : !!c.friendly;
    if (c.type === "npc") return actor?.type === "npc" ? !c.friendly : !!c.friendly;
    return false;
  }

  /** Format a combatant's preposition+zone name for display next to its row. */
  function combatantPositionLabel(c: typeof encounter.combatants[0]): string | null {
    if (!c.zone) return null;
    if (c.zone.preposition) return c.zone.preposition;
    return null;
  }

  interface ZoneGroup {
    id: string;
    name: string;
    combatants: typeof encounter.combatants;
  }

  /** Build groups in this order: actor's zone, other declared zones, then "Unzoned". */
  let groups = $derived.by((): ZoneGroup[] => {
    const all = encounter.combatants ?? [];
    const actorZoneId = actor?.zone?.id;

    // Walk zone definitions in author order; actor's zone first.
    const orderedZones = [...encounter.zones];
    if (actorZoneId) {
      const idx = orderedZones.findIndex((z) => z.id === actorZoneId);
      if (idx > 0) {
        const [actorZone] = orderedZones.splice(idx, 1);
        orderedZones.unshift(actorZone);
      }
    }

    const result: ZoneGroup[] = [];
    for (const zone of orderedZones) {
      const members = all
        .filter((c) => c.zone?.id === zone.id)
        .sort(alphaSort);
      if (members.length > 0) {
        result.push({ id: zone.id, name: zone.name, combatants: members });
      }
    }

    // Combatants without a zone (or pointing to a removed zone) -> "Unzoned"
    const knownZoneIds = new Set(encounter.zones.map((z) => z.id));
    const unzoned = all
      .filter((c) => !c.zone || !knownZoneIds.has(c.zone.id))
      .sort(alphaSort);
    if (unzoned.length > 0) {
      result.push({ id: "_unzoned", name: "Unzoned", combatants: unzoned });
    }

    return result;
  });

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

  /** Toggle every living combatant in a zone: check all if any unchecked, else uncheck all. */
  function toggleZone(group: ZoneGroup) {
    const living = group.combatants.filter((c) => !(c.conditions ?? []).includes("dead"));
    if (living.length === 0) return;
    const allChecked = living.every((c) => selected[c.id]?.checked);
    for (const c of living) {
      if (!selected[c.id]) selected[c.id] = { checked: false, outcome: "full" };
      selected[c.id].checked = !allChecked;
    }
  }
</script>

{#snippet targetRow(combatant: typeof encounter.combatants[0])}
  {@const sel = selected[combatant.id]}
  {@const prepLabel = combatantPositionLabel(combatant)}
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
      >{isFriendly(combatant) ? "\u{1F6E1}" : "⚔"}</button>
      <button
        class="dnd-target-name"
        onclick={() => selectSingle(combatant.id)}
      >
        {combatant.name}
        {#if prepLabel}
          <span class="dnd-target-prep">{prepLabel}</span>
        {/if}
        {#if (combatant.type === "npc" || combatant.type === "object") && combatant.hp}
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
  {#each groups as group (group.id)}
    <button
      class="dnd-dropdown-section-header dnd-zone-header-btn"
      onclick={() => toggleZone(group)}
      title="Tap to select/deselect all in this zone"
    >
      {group.name}
      {#if actor?.zone?.id === group.id}
        <span class="dnd-zone-here">(here)</span>
      {/if}
    </button>
    {#each group.combatants as combatant (combatant.id)}
      {@render targetRow(combatant)}
    {/each}
  {/each}

  <div class="dnd-dropdown-row" style="justify-content: space-between;">
    {#if onAddTarget}
      <button class="dnd-bar-btn" onclick={onAddTarget}>+ Add Target</button>
    {:else}
      <span></span>
    {/if}
    <button class="dnd-bar-btn" onclick={onClose}>Done</button>
  </div>
</div>
