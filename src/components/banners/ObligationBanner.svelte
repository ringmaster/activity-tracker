<script lang="ts">
  import type { ObligationBannerData } from "../../state/obligation-engine.svelte";
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import { resolveObligation } from "../../state/obligation-engine.svelte";

  let { banner, encounter }: {
    banner: ObligationBannerData;
    encounter: EncounterState;
  } = $props();

  let result = $state<"pass" | "fail" | null>(null);

  function handleResolve(disposition: "dismiss" | "recur") {
    if (!result) return;
    resolveObligation(encounter, banner.obligation.id, result, disposition);
  }

  let statDisplay = $derived(
    Array.isArray(banner.stat) ? banner.stat.join("/").toUpperCase() : (banner.stat?.toUpperCase() ?? ""),
  );

  let triggerDisplay = $derived(
    banner.trigger.replace(/_/g, " "),
  );

  // Compute smart default: if result is set and spell defines on_success behavior
  let smartDismiss = $derived.by(() => {
    if (!result) return null;
    if (result === "pass" && banner.onSuccess === "ends") return "dismiss";
    if (result === "pass" && banner.onSuccess === "continues") return "recur";
    if (result === "fail") return "recur"; // Most fail cases continue
    return null;
  });

  function handleSmartResolve() {
    if (!result || !smartDismiss) return;
    resolveObligation(
      encounter,
      banner.obligation.id,
      result,
      smartDismiss as "dismiss" | "recur",
    );
  }
</script>

<div class="dnd-obligation-banner" class:concentration={banner.isConcentration}>
  <div class="dnd-banner-title">
    &#9888; {banner.targetName}: {banner.spellName}
    {#if banner.kind === "save" || banner.kind === "save_for_half"}
      save
    {/if}
  </div>

  <div class="dnd-banner-detail">
    {#if banner.stat}
      ({statDisplay} DC {banner.dc})
    {/if}
    at {triggerDisplay}
    {#if banner.onFail}
      &middot; Fail: {banner.onFail}
    {/if}
    {#if banner.onSuccess && banner.onSuccess !== "ends" && banner.onSuccess !== "continues"}
      &middot; Pass: {banner.onSuccess}
    {/if}
  </div>

  <div class="dnd-banner-actions">
    <button
      class="dnd-banner-btn pass"
      class:selected={result === "pass"}
      onclick={() => { result = "pass"; }}
    >Pass</button>
    <button
      class="dnd-banner-btn fail"
      class:selected={result === "fail"}
      onclick={() => { result = "fail"; }}
    >Fail</button>

    {#if result && smartDismiss}
      <button class="dnd-banner-btn dismiss" onclick={handleSmartResolve}>
        {smartDismiss === "dismiss" ? "Dismiss" : "Recur"} (auto)
      </button>
    {/if}

    {#if result}
      <button class="dnd-banner-btn" onclick={() => handleResolve("dismiss")}>
        Dismiss
      </button>
      <button class="dnd-banner-btn" onclick={() => handleResolve("recur")}>
        Recur
      </button>
    {/if}
  </div>
</div>
