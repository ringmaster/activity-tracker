<script lang="ts">
  let {
    value = $bindable(""),
    placeholder = "",
    suggestions = [],
    onSelect,
    className = "",
  }: {
    value: string;
    placeholder?: string;
    suggestions: string[];
    onSelect?: (val: string) => void;
    className?: string;
  } = $props();

  let showSuggestions = $state(false);
  let filtered = $derived(
    value.length > 0
      ? suggestions.filter((s) =>
          s.toLowerCase().includes(value.toLowerCase()),
        ).slice(0, 10)
      : [],
  );

  function handleInput(e: Event) {
    value = (e.target as HTMLInputElement).value;
    showSuggestions = filtered.length > 0;
  }

  function selectSuggestion(s: string) {
    value = s;
    showSuggestions = false;
    onSelect?.(s);
  }

  function handleBlur() {
    // Delay to allow click on suggestion
    setTimeout(() => { showSuggestions = false; }, 200);
  }
</script>

<div style="position: relative;">
  <input
    type="text"
    class="dnd-action-input {className}"
    {placeholder}
    {value}
    oninput={handleInput}
    onfocus={() => { if (filtered.length > 0) showSuggestions = true; }}
    onblur={handleBlur}
  />
  {#if showSuggestions && filtered.length > 0}
    <div class="dnd-dropdown" style="position: absolute; top: 100%; left: 0; width: 200px; max-height: 200px;">
      {#each filtered as suggestion}
        <div
          class="dnd-dropdown-row"
          role="button"
          tabindex="-1"
          onmousedown={() => selectSuggestion(suggestion)}
        >
          {suggestion}
        </div>
      {/each}
    </div>
  {/if}
</div>
