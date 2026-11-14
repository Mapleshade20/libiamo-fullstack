/* The navigation stickers as markup (stickers.css draws and moves them). Cards, carton, branch and account come from
   the main app (components/shell/nav/icons); the pen on a pad is new, drawn in the same hand. Paper is always
   composited before ink, so no part's white rim erases another's outline. */
export const STICKERS = {
	pen: `<svg class="st st-pen" viewBox="0 0 32 32" aria-hidden="true">
		<g transform="rotate(-5 14 18)"><rect class="nav-cut" x="5.5" y="8.5" width="16.5" height="19.5" rx="2"/></g>
		<g class="pen"><path class="nav-cut" d="M26.6 3.4 29.6 6.4 18.4 17.6 14.4 19 15.8 15Z"/></g>
		<g transform="rotate(-5 14 18)">
			<rect class="pad nav-stroke" x="5.5" y="8.5" width="16.5" height="19.5" rx="2"/>
			<path class="rule nav-stroke nav-stroke-thin" d="M8.6 14.2h8.6M8.6 18h10.2"/>
			<path class="squiggle nav-stroke nav-stroke-thin" d="M8.6 22.2c1.2-1.8 2.3 1.8 3.5 0s2.3 1.8 3.5 0"/>
		</g>
		<g class="pen">
			<path class="body nav-stroke" d="M26.6 3.4 29.6 6.4 18.4 17.6 15.8 15Z"/>
			<path class="band nav-stroke nav-stroke-thin" d="m22.8 7.2 3 3-1.3 1.3-3-3Z"/>
			<path class="nib nav-stroke nav-stroke-thin" d="M15.8 15 18.4 17.6 14.4 19Z"/>
			<path class="nav-shine" d="m25.2 6.2-6.6 6.6"/>
		</g>
	</svg>`,
	cards: `<svg class="st st-cards" viewBox="0 0 32 32" aria-hidden="true">
		<g transform="translate(14.25 16.9)"><g class="card back"><path class="nav-cut" d="M-5.7-10.6 5.5-10.2Q8-10.4 8.1-7.7L7.5 8.5Q7.4 10.8 5 10.6L-5.8 10.2Q-8.3 10.3-8.1 7.7L-7.8-8.2Q-7.8-10.5-5.7-10.6Z"/></g></g>
		<g transform="translate(18.2 15.8)"><g class="card front"><path class="nav-cut" d="M-5.4-10.3 5.8-10.7Q7.9-10.7 7.8-8L8.2 8.1Q8.3 10.1 5.7 10.3L-5.6 10.7Q-8 10.8-8 8L-8.2-7.7Q-8.3-10.2-5.4-10.3Z"/></g></g>
		<g transform="translate(14.25 16.9)"><g class="card back"><rect class="back-paper nav-stroke" x="-7.6" y="-10.2" width="15.2" height="20.4" rx="2.2"/></g></g>
		<g transform="translate(18.2 15.8)"><g class="card front"><rect class="front-paper nav-stroke" x="-7.6" y="-10.2" width="15.2" height="20.4" rx="2.2"/><path class="rule nav-stroke nav-stroke-thin" d="M-4.3-2.4h8.6"/><path class="rule nav-stroke nav-stroke-thin" d="M-4.3 1.6h5.4"/></g></g>
	</svg>`,
	box: `<svg class="st st-box" viewBox="0 0 32 32" aria-hidden="true">
		<g class="lid"><path class="nav-cut" d="m5.6 11.1 3.7-3.9 16.5.6.4 3.7-3.8 3.7-16.6-.8Z"/></g>
		<path class="nav-cut" d="m6.4 11.8 3.3-3.5 15.4.4.5 14.5-3.5 2.8-14.8-.6Z"/>
		<path class="inside nav-stroke" d="m6.8 12 3-3.4 15 .4-3.3 3.7Z"/>
		<path class="side nav-stroke" d="m21.5 12.7 3.3-3.7.3 13.9-3.1 2.5Z"/>
		<path class="front" d="m6.8 12 14.7.7.5 12.7-14.5-.5Z"/>
		<path class="shade" d="m19.7 12.6 1.8.1.5 12.7-14.5-.5-.1-1.1 12.4.4Z"/>
		<path class="nav-stroke" d="m6.8 12 14.7.7.5 12.7-14.5-.5Z"/>
		<path class="label nav-stroke nav-stroke-thin" d="m10 17.4 8.7.3-.1 4.2-8.6-.3Z"/>
		<path class="writing nav-stroke nav-stroke-thin" d="m11.6 19 5.3.2m-5.3 1.3 3.3.1"/>
		<path class="fold nav-stroke nav-stroke-thin" d="m23.4 15 .1 5.3"/>
		<g class="lid"><path class="top nav-stroke" d="m6 11.2 3.5-3.6 16 .5-3.6 3.8Z"/><path class="side nav-stroke" d="m21.9 11.9 3.6-3.8.2 3.2-3.5 3.6Z"/><path class="front nav-stroke" d="m6 11.2 15.9.7.3 3L6.2 14Z"/><path class="fold nav-stroke nav-stroke-thin" d="m9.9 9 10.9.4"/></g>
	</svg>`,
	pr: `<svg class="st st-pr" viewBox="0 0 32 32" aria-hidden="true">
		<g class="nav-cut"><path class="nav-cut-line" d="M8.4 8.1q.8 7.8.1 15.8"/><path d="M5 8c.1-2.3 2-3.9 4.2-3.7s3.6 1.9 3.4 4.2-1.9 3.5-4 3.3S4.8 10.2 5 8Z"/><path d="M5.1 23.6c.2-2.2 1.9-3.5 4.1-3.4s3.6 1.9 3.3 4.2-1.9 3.5-4.2 3.2-3.5-1.8-3.2-4Z"/><path d="M19.5 24c-.2-2.1 1.5-4 3.8-3.9s3.9 1.8 3.8 4-1.9 3.7-4.2 3.5-3.4-1.7-3.4-3.6Z"/></g>
		<g class="arrow"><path class="nav-cut" d="m18.8 4.6.3 7-6-3.3Z"/></g>
		<path class="branch-cut nav-cut nav-cut-line" d="M23.5 20.5c-.5-8.8.6-12.9-5-12.6"/>
		<path class="line branch nav-stroke" d="M23.2 20.5c0-9.2.6-12.4-4.6-12.4"/>
		<g class="arrow"><path class="head nav-stroke" d="M18.6 5.1v6L13.6 8.1Z"/></g>
		<path class="line nav-stroke" d="M8.8 11.3v9.4"/>
		<circle class="source nav-stroke" cx="8.8" cy="23.9" r="3.4"/><circle class="source nav-stroke" cx="23.2" cy="23.9" r="3.4"/>
		<g class="landing"><circle class="target nav-stroke" cx="8.8" cy="8.1" r="3.4"/></g>
	</svg>`,
	me: `<svg class="st st-me" viewBox="0 0 32 32" aria-hidden="true">
		<defs><clipPath id="st-me-clip"><circle cx="16" cy="16" r="13.8"/></clipPath></defs>
		<path class="nav-cut" d="M1.8 15.2C2.1 7.1 8.5 1.5 16.5 1.9S30.6 8.8 30 16.6 23.8 30.8 15.5 30.2 1.2 23.2 1.8 15.2Z"/>
		<circle class="disc" cx="16" cy="16" r="13.8"/>
		<g class="bust"><g clip-path="url(#st-me-clip)"><path class="coat nav-stroke" d="M4.6 32c0-6.2 5.1-11.4 11.4-11.4S27.4 25.8 27.4 32Z"/></g>
		<circle class="head nav-stroke" cx="16" cy="12.8" r="5"/><path class="nav-shine" d="M13.2 10.6a3.2 3.2 0 0 1 2.2-1.7"/></g>
		<circle class="nav-stroke" cx="16" cy="16" r="13.8"/>
	</svg>`,
};
export type StickerName = keyof typeof STICKERS;
