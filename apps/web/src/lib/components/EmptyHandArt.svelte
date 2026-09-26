<script lang="ts">
  import { settings } from "../stores/settings.svelte.js";
  let failed = $state(false);
</script>

<span class="empty-art" aria-hidden="true">
  {#if !settings.highContrast && !failed}
    <img src={`${import.meta.env.BASE_URL}art/ui/empty-hand.png`} alt="" onerror={() => (failed = true)} />
  {:else}
    <svg class="fallback" viewBox="0 0 120 88" aria-hidden="true">
      <ellipse cx="60" cy="78" rx="43" ry="5" fill="#614728" opacity="0.12" />
      <g stroke="#80633e" stroke-width="1.6" stroke-linejoin="round">
        <rect x="22" y="16" width="43" height="58" rx="5" transform="rotate(-16 44 66)" fill="#e3c98b" />
        <rect x="56" y="13" width="43" height="58" rx="5" transform="rotate(16 76 66)" fill="#eedbb0" />
        <rect x="38" y="8" width="45" height="65" rx="5" fill="#36563a" />
        <rect x="43" y="13" width="35" height="55" rx="3" fill="none" stroke="#d6b76d" stroke-width="1" />
        <path d="m49 39 11-10 12 10v17H49z" fill="#fff0ca" />
        <path d="m46 40 14-15 15 15h-6l-9-9-8 9z" fill="#b95338" />
        <path d="M57 56v-9a3 3 0 0 1 6 0v9" fill="#80633e" />
        <path d="m27 3 1.5 5.5L34 10l-5.5 1.5L27 17l-1.5-5.5L20 10l5.5-1.5z M97 49l1.5 4.5L103 55l-4.5 1.5L97 61l-1.5-4.5L91 55l4.5-1.5z" fill="#e2b452" stroke="none" />
      </g>
    </svg>
  {/if}
</span>

<style>
  .empty-art { display: block; width: 100%; height: 100%; }
  img, svg { display: block; width: 100%; height: 100%; object-fit: contain; }
</style>
