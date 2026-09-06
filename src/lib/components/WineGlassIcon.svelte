<script lang="ts">
interface Props {
	width?: number;
	height?: number;
}
let { width = 28, height = 28 }: Props = $props();
const iconId = $props.id();
</script>

<svg {width} {height} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none" aria-hidden="true">
	<defs>
		<linearGradient id={`${iconId}-wineGrad`} x1="0%" y1="0%" x2="100%" y2="100%">
			<stop offset="0%" stop-color="#E32B4F" />
			<stop offset="100%" stop-color="#6E0B1F" />
		</linearGradient>

		<clipPath id={`${iconId}-glassClip`}>
			<path d="M -14,-20 C -14,10 -3,20 0,20 C 3,20 14,10 14,-20 Z" />
		</clipPath>

		<g id={`${iconId}-glassOutline`}>
			<ellipse cx="0" cy="-20" rx="14" ry="2.5" fill="none" stroke="#2D2D2D" stroke-width="1.2" />
			<path d="M -14,-20 C -14,10 -3,20 0,20 C 3,20 14,10 14,-20" fill="none" stroke="#2D2D2D" stroke-width="1.2" />
			<line x1="0" y1="20" x2="0" y2="45" stroke="#2D2D2D" stroke-width="1.2" stroke-linecap="round" />
			<line x1="-8" y1="45" x2="8" y2="45" stroke="#2D2D2D" stroke-width="1.2" stroke-linecap="round" />
		</g>
	</defs>

	<g>
		<g transform="translate(30, 50) rotate(15)">
			<g clip-path="url(#{iconId}-glassClip)">
				<path d="M -20, -2 Q 0, 8 20, -18 L 20, 30 L -20, 30 Z" fill="url(#{iconId}-wineGrad)" />
				<path d="M -20, 5 Q 0, 12 20, -8 L 20, 30 L -20, 30 Z" fill="#4A0614" opacity="0.4" />
			</g>
			<use href={`#${iconId}-glassOutline`} />
		</g>

		<g transform="translate(70, 50) rotate(-15)">
			<g clip-path="url(#{iconId}-glassClip)">
				<path d="M -20, -18 Q 0, 8 20, -2 L 20, 30 L -20, 30 Z" fill="url(#{iconId}-wineGrad)" />
				<path d="M -20, -8 Q 0, 12 20, 5 L 20, 30 L -20, 30 Z" fill="#4A0614" opacity="0.4" />
			</g>
			<use href={`#${iconId}-glassOutline`} />
		</g>

		<g id={`${iconId}-splashes`}>
			<path d="M 52, 22 C 55, 12 62, 8 62, 8 C 58, 12 55, 18 52, 22 Z" fill="url(#{iconId}-wineGrad)" />
			<path d="M 48, 24 C 44, 16 38, 14 38, 14 C 41, 17 44, 21 48, 24 Z" fill="url(#{iconId}-wineGrad)" />
			<circle cx="62" cy="4" r="1.5" fill="#E32B4F" />
			<circle cx="68" cy="12" r="1" fill="#E32B4F" />
			<circle cx="34" cy="10" r="1.2" fill="#E32B4F" />
			<circle cx="48" cy="10" r="2" fill="#E32B4F" />
		</g>

		<g id={`${iconId}-clink-spark`}>
			<path d="M 50, 18 Q 50, 27 59, 27 Q 50, 27 50, 36 Q 50, 27 41, 27 Q 50, 27 50, 18 Z" fill="#D4AF37" />
			<circle cx="50" cy="27" r="4" fill="#D4AF37" opacity="0.3" />
		</g>
	</g>
</svg>
