<script lang="ts">
  import type { CardType } from "@manors-menaces/rules";
  let { type }: { type: CardType } = $props();
</script>

<svg class="card-art" viewBox="0 0 72 52" aria-hidden="true">
  <ellipse cx="36" cy="29" rx="29" ry="20" fill="currentColor" opacity="0.12" />
  <g stroke="#493322" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    {#if type === "spell"}
      <path d="M24 44 43 12" stroke="#886133" stroke-width="5" />
      <path d="m43 5 7 9-8 9-6-10z" fill="#bd9cde" />
      <path d="m43 5-1 18" stroke="#f8e6ff" />
      <path d="m22 10 2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#f5d27e" />
      <path d="m54 30 1 4 4 1-4 1-1 4-1-4-4-1 4-1z" fill="#f5d27e" />
    {:else if type === "hero"}
      <path d="m20 13 15-5 16 5v13c-1 9-8 15-16 19-8-4-14-10-15-19z" fill="#be5639" />
      <path d="m26 16 9-3 10 3v10c-1 6-5 10-10 13-5-3-9-7-9-13z" fill="#f2d68d" />
      <path d="m32 35 17-25 6-3-1 7-17 25z" fill="#d7e1df" />
      <path d="m29 32 12 8 M32 38l-3 5" stroke="#624623" stroke-width="3" />
    {:else if type === "trick"}
      <path d="M11 22q12-11 25-4 13-7 25 4l-5 14q-11 5-20-4-9 9-20 4z" fill="#64844c" />
      <path d="m19 24 11 3-10 3z m23 3 11-3-1 6z" fill="#fff0cc" />
      <path d="m14 19-5-8 M58 19l5-8" stroke="#765131" />
    {:else if type === "charter"}
      <path d="M19 42V22L36 9l17 13v20z" fill="#f4dfae" />
      <path d="m14 24 22-19 22 19h-8L36 13 22 24z" fill="#bd583e" />
      <path d="M31 42V32a5 5 0 0 1 10 0v10" fill="#725035" />
      <path d="M48 8V2l12 4-12 4" fill="#dfb85f" />
    {:else}
      <path d="M17 11h36v30H17z" fill="#f3deac" />
      <path d="M17 11c-9 0-9 9 0 9h32 M53 41c9 0 9-9 0-9H21" fill="#d0aa68" />
      <path d="M26 23h18 M26 28h11" stroke="#96743f" />
      <circle cx="43" cy="36" r="7" fill="#b74d38" />
      <path d="m40 41-2 8 5-2 4 2-1-8" fill="#b74d38" />
    {/if}
  </g>
</svg>

<style>
  .card-art {
    width: 100%;
    height: 100%;
    flex: none;
  }
</style>
