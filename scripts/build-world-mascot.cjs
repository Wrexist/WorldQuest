/** Editable vector rig for the approved globe design. Native runtime uses transparent layers. */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const out = path.resolve('apps/mobile/assets/art/world-mascot/rig');
const source = path.resolve('docs/design/assets/world-mascot/rig');
const c = { blue:'#006ADA', shade:'#0055B6', land:'#78C845', ink:'#062957', white:'#FFFFFF', coral:'#FF754C', coralDark:'#EA5F3A', gold:'#FFBE19', goldDark:'#E59B08', shine:'#FFE479' };
const parts = {
  feet: `<path fill="${c.blue}" d="M104 221h27v31h-27zM155 220h27v32h-27z"/><path fill="${c.goldDark}" d="M106 246q-24 7-27 23q0 13 28 12q28 0 30-12l-7-23zM157 246q-8 19 2 30q14 9 40 2q14-6-1-23l-16-10z"/><path fill="${c.gold}" d="M106 242q-23 6-27 22q-1 11 26 10q28 0 29-12l-5-21zM157 242q-8 16 2 26q15 9 39 1q9-6-3-17l-14-12z"/><ellipse cx="99" cy="255" rx="12" ry="5" transform="rotate(-30 99 255)" fill="${c.shine}"/><ellipse cx="180" cy="253" rx="12" ry="5" transform="rotate(25 180 253)" fill="${c.shine}"/>`,
  leftArm: `<path fill="${c.blue}" d="M58 162q-29 11-36 41q-10 28 4 31q13 3 19-19q6 9 12 0l12-34z"/>`,
  rightArm: `<path fill="${c.shade}" d="M218 160q23 0 35-23l13 13q-15 35-44 32z"/><path fill="${c.blue}" d="M242 153q4-18 8-36q4-13 12-5q6-7 13 2q14 23-16 53z"/>`,
  body: `<defs><clipPath id="globe"><ellipse cx="140" cy="132" rx="100" ry="105"/></clipPath></defs><ellipse cx="140" cy="136" rx="100" ry="105" fill="${c.shade}"/><g clip-path="url(#globe)"><ellipse cx="140" cy="126" rx="100" ry="105" fill="${c.blue}"/><g fill="${c.land}"><path d="M40 35l85-16q43 3 32 16q-9 12-21 9q-15-18-28-2q-8 9 10 13q24 6 14 20q-5 8-23 11q-10 2-7 12q4 10-10 11q-13-11-19-2q-6 9-10 17q-10 4-13-10l-22-2z"/><path d="M173 23q-10 10 7 18q15 8 0 15q-10 6-2 14q7 5 17-4q12-7 20 8l21 29l19-51z"/><path d="M32 134q17-11 30 2q6 7 19 7q21 2 17 14q-3 9-19 12q-8 5 3 17q8 9 3 19q-34-8-45-34z"/><path d="M241 117q-18 8-13 28q2 7-7 16q-13 14 3 29l19 2z"/></g></g>`,
  eyes: `<ellipse cx="115" cy="133" rx="24" ry="33" fill="${c.white}" transform="rotate(13 115 133)"/><ellipse cx="175" cy="117" rx="22" ry="31" fill="${c.white}" transform="rotate(-8 175 117)"/>`,
  pupils: `<ellipse cx="123" cy="138" rx="14" ry="22" fill="${c.ink}"/><ellipse cx="183" cy="121" rx="13" ry="21" fill="${c.ink}"/><ellipse cx="129" cy="129" rx="5" ry="7" fill="${c.white}"/><ellipse cx="189" cy="112" rx="5" ry="6" fill="${c.white}"/>`,
  scarf: `<path d="M97 197q51 16 102-15q-6 27-21 45q-34-10-53-23q-9 20-18 12q1-12 7-15q-16 4-17-4z" fill="${c.coral}"/><path d="M114 200q4-5 10 2l-11 8z" fill="${c.coralDark}"/>`,
  smile: `<path d="M128 169q20 10 42-4q4 27-17 29q-19 0-25-25" fill="${c.ink}"/><path d="M139 187q11-11 25-3q-11 16-25 3" fill="${c.coral}"/>`,
  thinking: `<path d="M143 179q7-5 14-1" fill="none" stroke="${c.ink}" stroke-width="5" stroke-linecap="round"/>`,
  gentle: `<path d="M131 175q19 18 37-4" fill="none" stroke="${c.ink}" stroke-width="5" stroke-linecap="round"/>`,
  happyEyes: `<path d="M100 135q12-21 26-4M162 121q11-20 23-4" fill="none" stroke="${c.ink}" stroke-width="7" stroke-linecap="round"/>`,
};
// Separate contours let eyes blink without flattening the head.
parts.brows = `<path d="M92 95q10-16 24-14M165 73q14-6 24 8" fill="none" stroke="${c.ink}" stroke-width="6" stroke-linecap="round"/>`;
(async () => {
 fs.mkdirSync(out,{recursive:true}); fs.mkdirSync(source,{recursive:true});
 for (const [name, body] of Object.entries(parts)) {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600" viewBox="0 0 300 300">${body}</svg>`;
  fs.writeFileSync(path.join(source,name+'.svg'),svg);
  await sharp(Buffer.from(svg)).webp({lossless:true}).toFile(path.join(out,name+'.webp'));
 }
 console.log('Built',Object.keys(parts).length,'transparent rig layers');
})();

