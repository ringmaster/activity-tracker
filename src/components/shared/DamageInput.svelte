<script lang="ts">
  import type { DamageComponent } from "../../types/encounter";

  const DAMAGE_TYPES = [
    "slashing", "piercing", "bludgeoning",
    "fire", "cold", "lightning", "thunder",
    "acid", "poison", "necrotic", "radiant",
    "force", "psychic",
  ];

  let { value = $bindable([{ n: 0, type: "" }]) }: {
    value: DamageComponent[];
  } = $props();

  let activeTypeIdx = $state<number | null>(null);

  let filteredTypes = $derived.by(() => {
    if (activeTypeIdx === null) return [];
    const current = (value[activeTypeIdx]?.type ?? "").toLowerCase();
    if (current.length === 0) return DAMAGE_TYPES;
    return DAMAGE_TYPES.filter((t) => t.startsWith(current));
  });

  function addComponent() {
    value = [...value, { n: 0, type: "" }];
  }

  function updateN(idx: number, val: string) {
    const num = parseInt(val, 10);
    value[idx].n = isNaN(num) ? 0 : num;
  }

  function updateType(idx: number, val: string) {
    value[idx].type = val;
  }

  function selectType(idx: number, dmgType: string) {
    value[idx].type = dmgType;
    activeTypeIdx = null;
  }

  function removeComponent(idx: number) {
    value = value.filter((_, i) => i !== idx);
  }

  function handleTypeFocus(idx: number) {
    activeTypeIdx = idx;
  }

  function handleTypeBlur() {
    setTimeout(() => { activeTypeIdx = null; }, 200);
  }
</script>

<div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap; position: relative;">
  {#each value as comp, idx (idx)}
    {#if idx > 0}
      <span style="color: var(--text-muted);">+</span>
    {/if}
    <input
      type="number"
      inputmode="numeric"
      class="dnd-action-input narrow"
      placeholder="dmg"
      value={comp.n || ""}
      oninput={(e) => updateN(idx, (e.target as HTMLInputElement).value)}
    />
    <div style="position: relative;">
      <input
        type="text"
        class="dnd-action-input narrow"
        placeholder="type"
        value={comp.type}
        oninput={(e) => updateType(idx, (e.target as HTMLInputElement).value)}
        onfocus={() => handleTypeFocus(idx)}
        onblur={handleTypeBlur}
      />
      {#if activeTypeIdx === idx && filteredTypes.length > 0}
        <div class="dnd-dropdown dnd-type-dropdown">
          {#each filteredTypes as dmgType}
            <button
              class="dnd-dropdown-row dnd-via-suggestion"
              onmousedown={() => selectType(idx, dmgType)}
            >{dmgType}</button>
          {/each}
        </div>
      {/if}
    </div>
    {#if idx > 0}
      <button
        class="dnd-bar-btn"
        style="min-width: 32px; min-height: 32px; font-size: 12px;"
        onclick={() => removeComponent(idx)}
      >&times;</button>
    {/if}
  {/each}
  <button
    class="dnd-bar-btn"
    style="min-width: 32px; min-height: 32px; font-size: 16px;"
    onclick={addComponent}
    title="Add damage type"
  >+</button>
</div>
