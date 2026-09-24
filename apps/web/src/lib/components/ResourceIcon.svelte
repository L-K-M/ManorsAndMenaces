<script lang="ts">
  import type { ResourceType } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { RESOURCE_COLORS, RESOURCE_GLYPHS } from "../theme.js";

  let { resource, size = 20, label = true }: { resource: ResourceType; size?: number; label?: boolean } = $props();
  const c = $derived(RESOURCE_COLORS[resource]);
</script>

<svg width={size} height={size} viewBox="-12 -12 24 24" role={label ? "img" : "presentation"} aria-label={label ? t(`resource.${resource}`) : undefined} class="res">
  <circle r="11.5" fill={c.fill} stroke={c.dark} stroke-width="1.5" />
  <path d={RESOURCE_GLYPHS[resource]} transform="scale(0.8)" fill={resource === "grain" ? "none" : c.dark} stroke={c.dark} stroke-width={resource === "grain" ? 2.2 : 1} />
</svg>

<style>
  .res {
    display: inline-block;
    vertical-align: middle;
    flex: none;
  }
</style>
