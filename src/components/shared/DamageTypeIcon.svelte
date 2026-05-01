<script lang="ts">
  import { DAMAGE_ICONS, DAMAGE_TYPES, getDamageIcon } from "../../icons/damage-icons";

  let { value = $bindable("") }: {
    value: string;
  } = $props();

  let showPicker = $state(false);

  let iconSvg = $derived(getDamageIcon(value));

  function select(type: string) {
    value = type;
    showPicker = false;
  }

  function handleBlur() {
    setTimeout(() => { showPicker = false; }, 200);
  }
</script>

<div class="dnd-dmg-type-icon-wrapper">
  <button
    class="dnd-dmg-type-btn"
    title={value || "Select damage type"}
    onclick={() => { showPicker = !showPicker; }}
    onblur={handleBlur}
  >
    {#if iconSvg}
      <span class="dnd-dmg-icon dnd-dmg-icon-btn" data-type={value}>
        {@html iconSvg}
      </span>
    {:else}
      <span class="dnd-dmg-type-text">{value || "?"}</span>
    {/if}
  </button>

  {#if showPicker}
    <div class="dnd-dmg-type-grid">
      {#each DAMAGE_TYPES as type}
        <button
          class="dnd-dmg-type-option"
          class:selected={type === value}
          title={type}
          onmousedown={() => select(type)}
        >
          <span class="dnd-dmg-icon dnd-dmg-icon-grid" data-type={type}>
            {@html DAMAGE_ICONS[type]}
          </span>
        </button>
      {/each}
    </div>
  {/if}
</div>
