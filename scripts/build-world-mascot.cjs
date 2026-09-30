/**
 * Editable vector rig for the approved globe mascot (Atlas). The native runtime stacks
 * these transparent layers and animates them (`WorldMascot.tsx`, `mascotPerformance.ts`).
 *
 * September 2026: the same silhouettes, re-rendered in the soft matte 3D of the island
 * and the Expedition props, so Atlas reads as one world with the scenery he stands in:
 * a key light from the upper left, a terminator shadow round the sphere, a cool rim
 * light on the right, raised continents with their own bevel and texture, glossy eyes
 * with irises, cheeks, a folded scarf and soled boots.
 *
 * Every layer keeps its old outline and position. The rig's pivots (RIG in
 * mascotPerformance.ts) are measured off those outlines, and a rotated arm that no longer
 * met its shoulder would be the tell. The continents stay imaginary blobs: this is a
 * character, never a map (docs/design/asset-prompts.md).
 *
 * Run: node scripts/build-world-mascot.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

const out = path.resolve('apps/mobile/assets/art/world-mascot/rig');
const source = path.resolve('docs/design/assets/world-mascot/rig');
/** Rendered at 3x the 300-unit rig, so the largest on-screen Atlas (~300 pt) stays sharp on a 3x phone. */
const PIXELS = 900;

const c = {
  ocean: '#0A6FE0', oceanLight: '#4FA8FF', oceanDeep: '#0046A8', oceanNight: '#00337F',
  land: '#7CCB47', landLight: '#B4EC7A', landDark: '#4E9B2A', landDeep: '#3A7D1F',
  ink: '#062957', inkSoft: '#1D4F8F', white: '#FFFFFF', eyeShade: '#EEF4FB',
  iris: '#2E7FE6', irisDeep: '#0B3F8C',
  coral: '#FF7A52', coralLight: '#FFA27F', coralDark: '#E0552F', coralDeep: '#C24424',
  gold: '#FFC21F', goldLight: '#FFE27A', goldDark: '#E59A08', goldDeep: '#B87400',
  blush: '#FF8FA3', rim: '#8FD3FF',
};

// Shared paints. Each layer is its own SVG, so every one declares what it uses.
const blur = (id, sd) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter>`;
const skin = (id, light, mid, dark, cx = '32%', cy = '26%', r = '85%') =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}"><stop offset="0" stop-color="${light}"/><stop offset=".45" stop-color="${mid}"/><stop offset="1" stop-color="${dark}"/></radialGradient>`;
const vertical = (id, top, bottom) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="1" stop-color="${bottom}"/></linearGradient>`;

const CONTINENTS = [
  'M40 35l85-16q43 3 32 16q-9 12-21 9q-15-18-28-2q-8 9 10 13q24 6 14 20q-5 8-23 11q-10 2-7 12q4 10-10 11q-13-11-19-2q-6 9-10 17q-10 4-13-10l-22-2z',
  'M173 23q-10 10 7 18q15 8 0 15q-10 6-2 14q7 5 17-4q12-7 20 8l21 29l19-51z',
  'M32 134q17-11 30 2q6 7 19 7q21 2 17 14q-3 9-19 12q-8 5 3 17q8 9 3 19q-34-8-45-34z',
  'M241 117q-18 8-13 28q2 7-7 16q-13 14 3 29l19 2z',
];

const parts = {
  body: `<defs>
      <clipPath id="globe"><ellipse cx="140" cy="132" rx="100" ry="105"/></clipPath>
      ${skin('sea', c.oceanLight, c.ocean, c.oceanDeep, '30%', '22%', '90%')}
      ${vertical('base', c.oceanDeep, c.oceanNight)}
      ${vertical('landFace', c.landLight, c.land)}
      <radialGradient id="terminator" cx="36%" cy="30%" r="78%"><stop offset=".55" stop-color="#001a4d" stop-opacity="0"/><stop offset="1" stop-color="#001a4d" stop-opacity=".42"/></radialGradient>
      <radialGradient id="spec" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
      ${blur('soft', 2.2)}${blur('softer', 5)}${blur('blushBlur', 4)}
    </defs>
    <ellipse cx="140" cy="136" rx="100" ry="105" fill="url(#base)"/>
    <g clip-path="url(#globe)">
      <ellipse cx="140" cy="126" rx="100" ry="105" fill="url(#sea)"/>
      <g fill="none" stroke="${c.oceanLight}" stroke-width="1.6" stroke-linecap="round" opacity=".35">
        <path d="M70 112q8-4 16 0t16 0"/><path d="M150 60q8-4 16 0t16 0"/><path d="M196 96q7-3 14 0"/>
        <path d="M110 214q8-4 16 0t16 0"/><path d="M60 196q7-3 14 0"/><path d="M204 206q7-3 14 0t14 0"/>
      </g>
      <g fill="${c.landDeep}" transform="translate(2.5 4)" filter="url(#soft)" opacity=".65">${CONTINENTS.map(d => `<path d="${d}"/>`).join('')}</g>
      <g fill="${c.landDark}" transform="translate(1.5 2.5)">${CONTINENTS.map(d => `<path d="${d}"/>`).join('')}</g>
      <g fill="url(#landFace)">${CONTINENTS.map(d => `<path d="${d}"/>`).join('')}</g>
      <g fill="none" stroke="${c.landLight}" stroke-width="2" stroke-linejoin="round" opacity=".55" transform="translate(-.8 -1)">${CONTINENTS.map(d => `<path d="${d}"/>`).join('')}</g>
      <g fill="${c.landDark}" opacity=".45">
        <circle cx="66" cy="44" r="3"/><circle cx="84" cy="52" r="2.2"/><circle cx="58" cy="60" r="2.4"/>
        <circle cx="198" cy="36" r="2.6"/><circle cx="226" cy="66" r="2.2"/><circle cx="52" cy="156" r="2.6"/>
        <circle cx="70" cy="176" r="2"/><circle cx="234" cy="150" r="2.2"/>
      </g>
      <g fill="${c.landLight}" opacity=".7">
        <path d="M100 30l5-8l5 8z"/><path d="M110 32l4-6l4 6z"/><path d="M204 48l4-7l4 7z"/>
      </g>
      <ellipse cx="140" cy="126" rx="100" ry="105" fill="url(#terminator)"/>
      <ellipse cx="150" cy="232" rx="78" ry="26" fill="${c.goldLight}" opacity=".22" filter="url(#softer)"/>
      <path d="M228 70q22 50 4 110" fill="none" stroke="${c.rim}" stroke-width="6" stroke-linecap="round" opacity=".5" filter="url(#soft)"/>
      <ellipse cx="96" cy="66" rx="34" ry="22" transform="rotate(-28 96 66)" fill="url(#spec)" filter="url(#softer)"/>
      <ellipse cx="86" cy="58" rx="9" ry="5" transform="rotate(-30 86 58)" fill="#fff" opacity=".7" filter="url(#soft)"/>
    </g>
    <g fill="${c.blush}" opacity=".55" filter="url(#blushBlur)"><ellipse cx="98" cy="170" rx="14" ry="8"/><ellipse cx="200" cy="152" rx="12" ry="7"/></g>`,

  eyes: `<defs>${vertical('white', c.white, c.eyeShade)}${blur('lid', 2.5)}
      <clipPath id="l"><ellipse cx="115" cy="133" rx="24" ry="33" transform="rotate(13 115 133)"/></clipPath>
      <clipPath id="r"><ellipse cx="175" cy="117" rx="22" ry="31" transform="rotate(-8 175 117)"/></clipPath></defs>
    <ellipse cx="115" cy="133" rx="24" ry="33" fill="url(#white)" transform="rotate(13 115 133)"/>
    <ellipse cx="175" cy="117" rx="22" ry="31" fill="url(#white)" transform="rotate(-8 175 117)"/>
    <g clip-path="url(#l)"><ellipse cx="113" cy="100" rx="30" ry="12" fill="${c.inkSoft}" opacity=".12" filter="url(#lid)"/></g>
    <g clip-path="url(#r)"><ellipse cx="175" cy="84" rx="28" ry="12" fill="${c.inkSoft}" opacity=".12" filter="url(#lid)"/></g>
    <ellipse cx="115" cy="133" rx="24" ry="33" fill="none" stroke="${c.ink}" stroke-opacity=".28" stroke-width="1.6" transform="rotate(13 115 133)"/>
    <ellipse cx="175" cy="117" rx="22" ry="31" fill="none" stroke="${c.ink}" stroke-opacity=".28" stroke-width="1.6" transform="rotate(-8 175 117)"/>`,

  pupils: `<defs>
      <radialGradient id="iris" cx="45%" cy="62%" r="60%"><stop offset="0" stop-color="${c.iris}"/><stop offset=".7" stop-color="${c.irisDeep}"/><stop offset="1" stop-color="${c.ink}"/></radialGradient>
      ${blur('glint', .8)}</defs>
    <ellipse cx="123" cy="138" rx="14" ry="22" fill="url(#iris)"/><ellipse cx="183" cy="121" rx="13" ry="21" fill="url(#iris)"/>
    <ellipse cx="124" cy="141" rx="8" ry="13" fill="${c.ink}"/><ellipse cx="184" cy="124" rx="7.5" ry="12.5" fill="${c.ink}"/>
    <ellipse cx="129" cy="129" rx="5" ry="7" fill="${c.white}"/><ellipse cx="189" cy="112" rx="5" ry="6" fill="${c.white}"/>
    <circle cx="119" cy="150" r="2.4" fill="${c.white}" opacity=".8" filter="url(#glint)"/><circle cx="179" cy="133" r="2.2" fill="${c.white}" opacity=".8" filter="url(#glint)"/>`,

  brows: `<path d="M92 95q10-16 24-14M165 73q14-6 24 8" fill="none" stroke="${c.ink}" stroke-width="6" stroke-linecap="round"/>
    <path d="M95 91q8-10 18-10M168 72q10-3 18 5" fill="none" stroke="${c.inkSoft}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`,

  smile: `<defs>${vertical('mouth', '#0B3572', c.ink)}${vertical('tongue', c.coralLight, c.coral)}
      <clipPath id="m"><path d="M128 169q20 10 42-4q4 27-17 29q-19 0-25-25"/></clipPath></defs>
    <path d="M128 169q20 10 42-4q4 27-17 29q-19 0-25-25" fill="url(#mouth)"/>
    <g clip-path="url(#m)"><path d="M130 170q20 9 40-4l-1 6q-19 11-38 3z" fill="${c.white}" opacity=".95"/>
    <path d="M139 187q11-11 25-3q-11 16-25 3" fill="url(#tongue)"/><path d="M146 186q5-3 10-1" fill="none" stroke="${c.coralDark}" stroke-width="1.4" stroke-linecap="round"/></g>
    <path d="M129 170q20 9 40-5" fill="none" stroke="${c.ink}" stroke-width="2" stroke-linecap="round"/>`,
  thinking: `<path d="M143 179q7-5 14-1" fill="none" stroke="${c.ink}" stroke-width="5" stroke-linecap="round"/>`,
  gentle: `<path d="M131 175q19 18 37-4" fill="none" stroke="${c.ink}" stroke-width="5" stroke-linecap="round"/>`,
  happyEyes: `<path d="M100 135q12-21 26-4M162 121q11-20 23-4" fill="none" stroke="${c.ink}" stroke-width="7" stroke-linecap="round"/>
    <path d="M104 131q9-13 18-3M166 117q8-12 16-3" fill="none" stroke="${c.inkSoft}" stroke-width="1.6" stroke-linecap="round" opacity=".6"/>`,

  // ── Emotions (September 2026). Each is its own layer so the runtime can swap faces and
  // animate lids and extras without redrawing the head. Lids are the eye's own outline
  // in skin, pivoted at the eye's top (LID_PIVOTS in mascotPerformance.ts): scaled down
  // they are open and invisible, scaled to 1 they close the eye, and anywhere between
  // they are the droop of sleepy or the half-lid of smug. Each lid is tinted to the
  // globe's shading where its eye sits (the key light is upper left), so a closed eye
  // reads as skin, not as a patch.
  lidLeft: `<defs>${vertical('lidL', '#2B86EE', '#0B6ADB')}</defs>
    <ellipse cx="115" cy="133" rx="25.5" ry="34.5" fill="url(#lidL)" transform="rotate(13 115 133)"/>
    <path d="M91 142q24 30 50 -2" fill="none" stroke="${c.ink}" stroke-width="3.2" stroke-linecap="round" transform="rotate(13 115 133)"/>`,
  lidRight: `<defs>${vertical('lidR', '#0F6FE0', '#0859C4')}</defs>
    <ellipse cx="175" cy="117" rx="23.5" ry="32.5" fill="url(#lidR)" transform="rotate(-8 175 117)"/>
    <path d="M152 125q23 29 47 -2" fill="none" stroke="${c.ink}" stroke-width="3.2" stroke-linecap="round" transform="rotate(-8 175 117)"/>`,
  laugh: `<defs>${vertical('mouthL', '#0B3572', c.ink)}${vertical('tongueL', c.coralLight, c.coral)}
      <clipPath id="ml"><path d="M122 164q27 14 55 -6q6 34 -27 40q-26 1 -28 -34"/></clipPath></defs>
    <path d="M122 164q27 14 55 -6q6 34 -27 40q-26 1 -28 -34" fill="url(#mouthL)"/>
    <g clip-path="url(#ml)"><path d="M123 164q27 13 54 -6l-1 8q-26 17 -52 5z" fill="${c.white}"/>
      <ellipse cx="150" cy="196" rx="19" ry="11" fill="url(#tongueL)"/></g>
    <path d="M122 164q27 14 55 -6" fill="none" stroke="${c.ink}" stroke-width="2.4" stroke-linecap="round"/>`,
  surprised: `<defs>${vertical('mouthO', '#0B3572', c.ink)}</defs>
    <ellipse cx="150" cy="180" rx="10" ry="13" fill="url(#mouthO)"/>
    <ellipse cx="150" cy="187" rx="6" ry="4" fill="${c.coral}" opacity=".9"/>`,
  smirk: `<path d="M130 176q22 10 40 -12" fill="none" stroke="${c.ink}" stroke-width="5" stroke-linecap="round"/>
    <path d="M167 166q5 -1 7 -6" fill="none" stroke="${c.ink}" stroke-width="3.4" stroke-linecap="round"/>`,
  tears: `<defs>${vertical('tear', '#BFE8FF', '#5AB8FF')}</defs>
    <path d="M86 142q-7 10 -2 15q6 4 9 -3q1 -5 -7 -12z" fill="url(#tear)" stroke="#fff" stroke-width="1.2"/>
    <path d="M203 124q8 9 4 15q-6 4 -9 -2q-1 -5 5 -13z" fill="url(#tear)" stroke="#fff" stroke-width="1.2"/>`,
  sparkles: `<g fill="${c.goldLight}" stroke="${c.gold}" stroke-width="1.2" stroke-linejoin="round">
      <path d="M44 60l4 10l10 4l-10 4l-4 10l-4 -10l-10 -4l10 -4z"/>
      <path d="M250 44l3 7l7 3l-7 3l-3 7l-3 -7l-7 -3l7 -3z"/>
      <path d="M262 96l2.4 5.6l5.6 2.4l-5.6 2.4l-2.4 5.6l-2.4 -5.6l-5.6 -2.4l5.6 -2.4z"/>
      <path d="M30 118l2 5l5 2l-5 2l-2 5l-2 -5l-5 -2l5 -2z"/></g>`,
  zzz: `<g fill="none" stroke="${c.inkSoft}" stroke-linecap="round" stroke-linejoin="round">
      <path d="M214 42h14l-14 16h14" stroke-width="4"/>
      <path d="M238 20h10l-10 11h10" stroke-width="3.2"/>
      <path d="M256 4h7l-7 8h7" stroke-width="2.6"/></g>`,

  scarf: `<defs>${vertical('cloth', c.coralLight, c.coral)}${vertical('knot', c.coral, c.coralDeep)}${blur('fold', 1.4)}
      <clipPath id="s"><path d="M97 197q51 16 102-15q-6 27-21 45q-34-10-53-23q-9 20-18 12q1-12 7-15q-16 4-17-4z"/></clipPath></defs>
    <path d="M97 197q51 16 102-15q-6 27-21 45q-34-10-53-23q-9 20-18 12q1-12 7-15q-16 4-17-4z" fill="url(#cloth)"/>
    <g clip-path="url(#s)">
      <path d="M126 205q30 8 64-12" fill="none" stroke="${c.coralDark}" stroke-width="3" opacity=".55" filter="url(#fold)"/>
      <path d="M150 212q16-2 30-14" fill="none" stroke="${c.coralDark}" stroke-width="2.4" opacity=".45" filter="url(#fold)"/>
      <path d="M104 199q40 12 90-14" fill="none" stroke="${c.coralLight}" stroke-width="2.4" opacity=".8"/>
      <path d="M100 206q48 22 88 18l-4 10q-40 0-86-24z" fill="${c.coralDeep}" opacity=".25" filter="url(#fold)"/>
    </g>
    <path d="M114 200q4-5 10 2l-11 8z" fill="url(#knot)"/>
    <path d="M113 204q2-3 6-1" fill="none" stroke="${c.coralLight}" stroke-width="1.4" stroke-linecap="round"/>`,

  leftArm: `<defs>${skin('armL', c.oceanLight, c.ocean, c.oceanDeep, '40%', '20%', '95%')}</defs>
    <path fill="url(#armL)" d="M58 162q-29 11-36 41q-10 28 4 31q13 3 19-19q6 9 12 0l12-34z"/>
    <path d="M32 200q6-18 20-28" fill="none" stroke="${c.oceanLight}" stroke-width="3" stroke-linecap="round" opacity=".55"/>`,
  rightArm: `<defs>${skin('armR', c.oceanLight, c.ocean, c.oceanDeep, '35%', '25%', '95%')}${vertical('sleeve', c.ocean, c.oceanDeep)}</defs>
    <path fill="url(#sleeve)" d="M218 160q23 0 35-23l13 13q-15 35-44 32z"/>
    <path fill="url(#armR)" d="M242 153q4-18 8-36q4-13 12-5q6-7 13 2q14 23-16 53z"/>
    <path d="M254 118q3-6 7-5M264 116q4-2 7 2" fill="none" stroke="${c.oceanLight}" stroke-width="2.2" stroke-linecap="round" opacity=".7"/>`,

  feet: `<defs>${vertical('leg', c.ocean, c.oceanDeep)}${vertical('boot', c.goldLight, c.gold)}${vertical('sole', c.goldDark, c.goldDeep)}</defs>
    <path fill="url(#leg)" d="M104 221h27v31h-27zM155 220h27v32h-27z"/>
    <path fill="url(#sole)" d="M106 246q-24 7-27 23q0 13 28 12q28 0 30-12l-7-23zM157 246q-8 19 2 30q14 9 40 2q14-6-1-23l-16-10z"/>
    <path fill="url(#boot)" d="M106 242q-23 6-27 22q-1 11 26 10q28 0 29-12l-5-21zM157 242q-8 16 2 26q15 9 39 1q9-6-3-17l-14-12z"/>
    <path d="M104 244h28M156 243h26" stroke="${c.goldDark}" stroke-width="3" stroke-linecap="round"/>
    <g fill="${c.goldDeep}" opacity=".6"><circle cx="112" cy="252" r="1.6"/><circle cx="120" cy="251" r="1.6"/><circle cx="166" cy="251" r="1.6"/><circle cx="174" cy="252" r="1.6"/></g>
    <ellipse cx="99" cy="255" rx="12" ry="5" transform="rotate(-30 99 255)" fill="${c.goldLight}"/><ellipse cx="180" cy="253" rx="12" ry="5" transform="rotate(25 180 253)" fill="${c.goldLight}"/>
    <ellipse cx="96" cy="253" rx="4" ry="2" transform="rotate(-30 96 253)" fill="${c.white}" opacity=".85"/><ellipse cx="183" cy="251" rx="4" ry="2" transform="rotate(25 183 251)" fill="${c.white}" opacity=".85"/>`,
};

(async () => {
  fs.mkdirSync(out, { recursive: true });
  fs.mkdirSync(source, { recursive: true });
  for (const [name, body] of Object.entries(parts)) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PIXELS}" height="${PIXELS}" viewBox="0 0 300 300">${body}</svg>`;
    fs.writeFileSync(path.join(source, name + '.svg'), svg);
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: false }).toFile(path.join(out, name + '.png'));
  }
  console.log('Built', Object.keys(parts).length, 'transparent rig layers at', PIXELS, 'px');
})();
