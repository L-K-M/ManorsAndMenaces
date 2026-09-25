<script lang="ts">
  import type { ResourceType } from "@manors-menaces/rules";
  import { t } from "../i18n.js";
  import { RESOURCE_COLORS, RESOURCE_DETAILS, RESOURCE_GLYPHS } from "../theme.js";

  let { resource, size = 20, label = true }: { resource: ResourceType; size?: number; label?: boolean } = $props();
  const c = $derived(RESOURCE_COLORS[resource]);
</script>

<!-- A painted coin: resource colour, a sheen, the ink silhouette and light
     hand-drawn detail. The silhouette alone identifies the resource. -->
<svg width={size} height={size} viewBox="-12 -12 24 24" role={label ? "img" : "presentation"} aria-label={label ? t(`resource.${resource}`) : undefined} class="res" data-resource={resource}>
  <circle r="11.2" fill={c.fill} stroke={c.dark} stroke-width="1.4" />
  <path d="M-8.2,-4.6 A9.4,9.4 0 0 1 4.4,-8.3" fill="none" stroke="#fff" stroke-opacity="0.55" stroke-width="1.3" stroke-linecap="round" />
  <g transform="scale(0.8)" stroke-linecap="round" stroke-linejoin="round">
    <path d={RESOURCE_GLYPHS[resource]} fill={c.dark} stroke={c.dark} stroke-width={resource === "grain" ? 2 : 1.2} />
    <path d={RESOURCE_DETAILS[resource]} fill="none" stroke={c.fill} stroke-width="1.1" />
  </g>
</svg>

<style>
  .res {
    display: inline-block;
    vertical-align: middle;
    flex: none;
  }
</style>
