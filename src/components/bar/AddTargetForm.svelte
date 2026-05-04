<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import type { Combatant } from "../../types/encounter";
  import { addCombatant } from "../../state/combat-engine.svelte";
  import { rollInitiative } from "../../utils/dice";
  import { toSlug } from "../../utils/id-generator";
  import { TARGET_TYPE_ICONS } from "../../icons/target-icons";

  type TargetType = "pc" | "npc" | "object";

  let { encounter, onCreate, onCancel }: {
    encounter: EncounterState;
    onCreate: (combatantId: string) => void;
    onCancel: () => void;
  } = $props();

  let name = $state("");
  let targetType = $state<TargetType>("object");
  let hp = $state("");
  let ac = $state("");
  let toHit = $state("");
  let init = $state("");

  function uniqueId(base: string): string {
    const existingIds = new Set(encounter.combatants.map((c) => c.id));
    if (!existingIds.has(base)) return base;
    let n = 2;
    while (existingIds.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
  }

  function handleCreate() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const baseId = toSlug(trimmedName) || `target-${Date.now()}`;
    const id = uniqueId(baseId);

    const combatant: Combatant = {
      id,
      name: trimmedName,
      type: targetType,
      init: 0,
      temp_hp: 0,
      conditions: [],
      tags: [],
      concentration: null,
    };

    if (targetType === "object") {
      const hpValue = parseInt(hp, 10);
      const max = isNaN(hpValue) ? 0 : hpValue;
      combatant.hp = { current: max, max };
      combatant.init = 0;
      const acValue = parseInt(ac, 10);
      if (!isNaN(acValue)) combatant.ac = acValue;
    } else if (targetType === "npc") {
      const hpValue = parseInt(hp, 10);
      const max = isNaN(hpValue) ? 0 : hpValue;
      combatant.hp = { current: max, max };
      const initValue = parseInt(init, 10);
      combatant.init = isNaN(initValue) ? rollInitiative(0) : initValue;
      const acValue = parseInt(ac, 10);
      if (!isNaN(acValue)) combatant.ac = acValue;
      const toHitValue = parseInt(toHit, 10);
      if (!isNaN(toHitValue)) combatant.toHit = toHitValue;
    } else {
      combatant.damage_taken = 0;
      const initValue = parseInt(init, 10);
      combatant.init = isNaN(initValue) ? rollInitiative(0) : initValue;
    }

    addCombatant(encounter, combatant);
    onCreate(id);
  }

  function selectType(type: TargetType) {
    targetType = type;
  }
</script>

<div class="dnd-action-bar">
  <button
    class="dnd-bar-btn"
    onclick={onCancel}
    title="Back to targets"
  >&larr;</button>

  <input
    type="text"
    class="dnd-action-input medium"
    placeholder="Name"
    bind:value={name}
    onkeydown={(e) => { if (e.key === "Enter") handleCreate(); }}
  />

  <div class="dnd-target-type-radio">
    <button
      class="dnd-target-type-btn"
      class:selected={targetType === "pc"}
      title="Player character"
      onclick={() => selectType("pc")}
    >
      <span class="dnd-target-type-icon">{@html TARGET_TYPE_ICONS.pc}</span>
    </button>
    <button
      class="dnd-target-type-btn"
      class:selected={targetType === "npc"}
      title="Non-player character"
      onclick={() => selectType("npc")}
    >
      <span class="dnd-target-type-icon">{@html TARGET_TYPE_ICONS.npc}</span>
    </button>
    <button
      class="dnd-target-type-btn"
      class:selected={targetType === "object"}
      title="Object"
      onclick={() => selectType("object")}
    >
      <span class="dnd-target-type-icon">{@html TARGET_TYPE_ICONS.object}</span>
    </button>
  </div>

  {#if targetType === "object" || targetType === "npc"}
    <input
      type="number"
      inputmode="numeric"
      class="dnd-action-input narrow"
      placeholder="HP"
      bind:value={hp}
    />
    <input
      type="number"
      inputmode="numeric"
      class="dnd-action-input narrow"
      placeholder="AC"
      bind:value={ac}
    />
  {/if}

  {#if targetType === "npc"}
    <input
      type="number"
      inputmode="numeric"
      class="dnd-action-input narrow"
      placeholder="ToHit"
      bind:value={toHit}
    />
  {/if}

  {#if targetType === "npc" || targetType === "pc"}
    <input
      type="number"
      inputmode="numeric"
      class="dnd-action-input narrow"
      placeholder="Init"
      bind:value={init}
    />
  {/if}

  <button class="dnd-bar-btn active" onclick={handleCreate}>Create</button>
</div>
