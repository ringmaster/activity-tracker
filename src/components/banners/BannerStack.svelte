<script lang="ts">
  import type { EncounterState } from "../../state/encounter-state.svelte";
  import type { ObligationBannerData } from "../../state/obligation-engine.svelte";
  import ObligationBanner from "./ObligationBanner.svelte";

  let { banners, encounter }: {
    banners: ObligationBannerData[];
    encounter: EncounterState;
  } = $props();
</script>

{#if banners.length > 0}
  <div class="dnd-banner-stack">
    {#each banners as banner (banner.obligation.id + banner.targetId)}
      <ObligationBanner {banner} {encounter} />
    {/each}
  </div>
{/if}
