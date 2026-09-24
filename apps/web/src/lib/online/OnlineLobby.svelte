<script lang="ts">
  import type { GameSession } from "../game/session.svelte.js";
  let { onback }: { onopen: (s: GameSession) => void; onback: () => void } = $props();
</script>

<section><p>Online play is coming in the next step.</p><button onclick={onback}>Back</button></section>
