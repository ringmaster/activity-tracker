<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { ALLEGIANCE_ICONS, STATBLOCK_ICON } from "../../icons/target-icons";
  import { getCreature, openStatblockView } from "../../state/statblocks-api";

  let {
    encounter,
    selected = $bindable<Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }>>({}),
    onClose,
    onAddTarget,
    damageType,
    auraInfo = null,
    actionNote = null,
  }: {
    encounter: EncounterState;
    selected: Record<string, { checked: boolean; outcome: "full" | "half" | "zero" }>;
    onClose?: () => void;
    onAddTarget?: () => void;
    damageType?: string;
    /** When set, the dropdown prefaces the list with an aura header. Targets
     *  remain selectable below for the rare case the DM wants to pin specific
     *  recipients, but the header explains why selection is optional. */
    auraInfo?: { on: "ally" | "enemy" | "all"; range?: string } | null;
    actionNote?: string | null;
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

  /** Dedupe an array by a key, preserving first occurrence. */
  function dedupeBy<T>(items: T[], keyFn: (item: T) => unknown): T[] {
    const seen = new Set<unknown>();
    const out: T[] = [];
    for (const item of items) {
      const key = keyFn(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  /** Build groups in this order: actor's zone, other declared zones, then "Unzoned". */
  let groups = $derived.by((): ZoneGroup[] => {
    const all = dedupeBy(encounter.combatants ?? [], (c) => c.id);
    const actorZoneId = actor?.zone?.id;

    // Walk zone definitions in author order; actor's zone first.
    const orderedZones = dedupeBy([...encounter.zones], (z) => z.id);
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
    const knownZoneIds = new Set(orderedZones.map((z) => z.id));
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

  /** True when the target has a statblock that the FS bestiary can
   *  resolve -- gates rendering of the per-row statblock button. */
  function canOpenStatblock(c: typeof encounter.combatants[0]): boolean {
    if (!c.statblock) return false;
    return !!getCreature(encounter.app, c.statblock);
  }

  function openTargetStatblock(c: typeof encounter.combatants[0]) {
    if (!c.statblock) return;
    openStatblockView(encounter.app, c.statblock);
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
      {#if combatant.type === "object"}
        <!-- Objects have no friendly/hostile state -- the icon is purely
             a type indicator, not a toggle. Rendered as a span so it can't
             be tabbed to or clicked. -->
        <span
          class="dnd-friendly-toggle dnd-friendly-toggle-static"
          title="Object"
        >{@html ALLEGIANCE_ICONS.object}</span>
      {:else}
        <!-- Icon encodes allegiance relative to the current actor: shield
             when this combatant is on the actor's side (don't attack;
             defend), swords when they're on the other side (attack
             these). Clicking still toggles `friendly` on the target; the
             icon flips with the new state. When the actor swaps, every
             row's icon re-derives because isFriendly() depends on the
             actor's type too. -->
        <button
          class="dnd-friendly-toggle"
          class:friendly={isFriendly(combatant)}
          title={isFriendly(combatant) ? "Ally (tap to mark hostile)" : "Enemy (tap to mark friendly)"}
          onclick={() => toggleFriendly(combatant.id)}
        >{@html isFriendly(combatant) ? ALLEGIANCE_ICONS.ally : ALLEGIANCE_ICONS.enemy}</button>
      {/if}
      <button
        class="dnd-target-name"
        onclick={() => selectSingle(combatant.id)}
      >
        <span class="dnd-target-name-text">{combatant.name}</span>
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
        <!-- Conditions other than dead/fled (those get their own DEAD/FLED
             chip), then the combatant's named tags (Blessed, Hexed,
             Concentrating: X, Turned, ...). Same chip classes as the
             code-block CombatantRow for visual consistency. -->
        {#each (combatant.conditions ?? []).filter((c) => c !== "dead" && c !== "fled") as cond}
          <span class="dnd-condition-chip">{cond}</span>
        {/each}
        {#each (combatant.tags ?? []) as tag (tag.id)}
          <span class="dnd-tag-chip" title={tag.note ?? ""}>{tag.name}</span>
        {/each}
      </button>

      {#if canOpenStatblock(combatant)}
        <!-- Sits directly right of the name (the selection button) and
             before the outcome radios. Opens the Fantasy Statblocks
             creature pane for this target without changing selection. -->
        <button
          type="button"
          class="dnd-statblock-open-btn"
          onclick={(e) => { e.stopPropagation(); openTargetStatblock(combatant); }}
          title="Open {combatant.statblock} statblock in the sidebar"
          aria-label="Open {combatant.statblock} statblock"
        >{@html STATBLOCK_ICON}</button>
      {/if}

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
  {#if auraInfo}
    {@const sideLabel = auraInfo.on === "ally" ? "allies" : auraInfo.on === "enemy" ? "enemies" : "everyone"}
    <div class="dnd-aura-header">
      <div class="dnd-aura-header-title">Aura: affects {sideLabel}{#if auraInfo.range} within {auraInfo.range}{/if}</div>
      <div class="dnd-aura-header-detail">
        Resolves per turn while the aura is up; you don't need to pick targets here.
      </div>
      {#if actionNote}
        <div class="dnd-aura-header-note">{actionNote}</div>
      {/if}
    </div>
  {/if}
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
