<script lang="ts">
let { active = false }: { playing?: boolean; active?: boolean } = $props();
</script>

<svg viewBox="0 0 32 32" aria-hidden="true" class:active>
	<!-- A removable telescoping lid: top and skirt travel as one rigid piece.
	     The stationary box preserves registration when the lid seats. -->
	<!-- All paper precedes all ink, so the lid's cut cannot erase the box. -->
	<g class="lid">
		<path class="nav-cut" d="m5.6 11.1 3.7-3.9 16.5.6.4 3.7-3.8 3.7-16.6-.8Z" />
	</g>
	<path class="nav-cut" d="m6.4 11.8 3.3-3.5 15.4.4.5 14.5-3.5 2.8-14.8-.6Z" />
	<path class="inside nav-stroke" d="m6.8 12 3-3.4 15 .4-3.3 3.7Z" />
	<path class="side nav-stroke" d="m21.5 12.7 3.3-3.7.3 13.9-3.1 2.5Z" />
	<path class="front" d="m6.8 12 14.7.7.5 12.7-14.5-.5Z" />
	<path class="shade" d="m19.7 12.6 1.8.1.5 12.7-14.5-.5-.1-1.1 12.4.4Z" />
	<!-- Ink follows both paper tones so the shading cannot cover the lower rim. -->
	<path class="nav-stroke" d="m6.8 12 14.7.7.5 12.7-14.5-.5Z" />
	<path class="label nav-stroke nav-stroke-thin" d="m10 17.4 8.7.3-.1 4.2-8.6-.3Z" />
	<path class="writing nav-stroke nav-stroke-thin" d="m11.6 19 5.3.2m-5.3 1.3 3.3.1" />
	<path class="fold nav-stroke nav-stroke-thin" d="m23.4 15 .1 5.3" />
	<g class="lid">
		<path class="top nav-stroke" d="m6 11.2 3.5-3.6 16 .5-3.6 3.8Z" />
		<path class="side nav-stroke" d="m21.9 11.9 3.6-3.8.2 3.2-3.5 3.6Z" />
		<path class="front nav-stroke" d="m6 11.2 15.9.7.3 3L6.2 14Z" />
		<path class="fold nav-stroke nav-stroke-thin" d="m9.9 9 10.9.4" />
	</g>
</svg>

<style>
svg {
	width: 100%;
	height: 100%;
	--nav-ink-scale: 1.6;
	scale: var(--nav-ink-scale);
	overflow: visible;
}
.front {
	fill: #d4bc8e;
}
.top {
	fill: #e4d1ab;
}
.side {
	fill: #b49a6d;
}
.inside {
	fill: #79684c;
}
.shade {
	fill: #c1a576;
}
.label {
	fill: #f6f0e2;
}
.writing,
.fold {
	stroke: #87785e;
}
.fold {
	opacity: 0.55;
}
.lid {
	transform-origin: 16px 11px;
	transition: transform 320ms cubic-bezier(0.4, 0, 0.2, 1);
}
.active .lid {
	transform: translate(2px, -5px) rotate(12deg);
}
@media (prefers-reduced-motion: reduce) {
	.lid {
		transition: none;
	}
}
</style>
