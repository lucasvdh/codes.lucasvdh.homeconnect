#!/usr/bin/env node
// Add per-capability SVG icons to the 7 capability JSONs that already shipped
// with /assets/icon.svg as a placeholder. Idempotent.

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const assetsRoot = resolve(process.cwd(), "assets", "capability");
mkdirSync(assetsRoot, { recursive: true });

function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
${body}
</svg>
`;
}

const icons = {
  homeconnect_door_state: svg(`<rect x="6" y="3" width="12" height="18" rx="1"/>
<circle cx="15" cy="12" r="0.8" fill="currentColor"/>
<path d="M6 21h12"/>`),
  homeconnect_operation_state: svg(`<circle cx="12" cy="12" r="9"/>
<path d="M10 9l5 3-5 3z" fill="currentColor"/>`),
  homeconnect_program: svg(`<rect x="4" y="4" width="16" height="16" rx="2"/>
<path d="M9 9h6"/>
<path d="M9 12h6"/>
<path d="M9 15h4"/>`),
  homeconnect_program_phase: svg(`<path d="M3 12a9 9 0 0 1 18 0"/>
<path d="M3 12a9 9 0 0 0 18 0"/>
<path d="M12 3v18"/>`),
  homeconnect_program_progress: svg(`<rect x="3" y="9" width="18" height="6" rx="3"/>
<rect x="5" y="11" width="9" height="2" rx="1" fill="currentColor"/>`),
  homeconnect_remaining_time: svg(`<circle cx="12" cy="13" r="8"/>
<path d="M12 9v4l3 2"/>
<path d="M9 2h6"/>`),
  homeconnect_remote_start: svg(`<rect x="3" y="5" width="14" height="14" rx="2"/>
<path d="M9 10l4 2-4 2z" fill="currentColor"/>
<path d="M17 5l4 4"/>
<circle cx="20" cy="6" r="1.5"/>`),
};

for (const [id, body] of Object.entries(icons)) {
  const svgPath = resolve(assetsRoot, `${id}.svg`);
  writeFileSync(svgPath, body);
}

console.log(`wrote ${Object.keys(icons).length} icons`);
