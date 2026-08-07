/**
 * Masters that exist and are deliberately NOT shipped, each with the reason.
 *
 * Shared by `build-art.cjs`, which skips them, and `import-art.cjs`, which needs to tell
 * a *parked* master apart from an *unmapped* one. Those look identical on disk and mean
 * opposite things: a parked file is a decision, an unmapped file is a mistake nobody has
 * noticed yet. With the list in one place, a file cannot be parked in one script and
 * unknown to the other.
 */

module.exports.NOT_SHIPPED = {
  'atlas/character-sheet':
    'A model sheet — a reference for keeping Atlas consistent between generations, not a ' +
    'picture any screen draws.',

  'celebration/sparkle-sheet':
    'A 2048×512 sprite strip of eight frames. The resize in build-art would scale it like ' +
    'a single image and silently break the frame arithmetic; it needs sprite handling ' +
    'before it can ship.',

  'levels/pioneer':
    'Not a rank. The ladder is wanderer · scout · navigator · cartographer · pathfinder · ' +
    'voyager · circumnavigator · trailblazer · globetrotter · worldkeeper · atlas, and the ' +
    'art is looked up by rank name, so nothing can ever reach a file called `pioneer`. It ' +
    'is also a near-duplicate of `trailblazer`, which is a clue about how it happened. The ' +
    'other half of that mismatch is a gap: level 100, `atlas`, has no insignia at all.',

  // Leagues are v2.0 — roadmap.md names them in v1.0's "explicitly not in" line and again
  // under "Social & business". Seven badges with no screen was 604 KB of bundle, a tenth
  // of the art, downloaded by every user for a feature that does not exist. Building the
  // league screen to justify the art would be building v2.0 during v1.0.
  'leagues/bronze': 'Leagues are v2.0 — no screen imports this yet.',
  'leagues/silver': 'Leagues are v2.0 — no screen imports this yet.',
  'leagues/gold': 'Leagues are v2.0 — no screen imports this yet.',
  'leagues/sapphire': 'Leagues are v2.0 — no screen imports this yet.',
  'leagues/ruby': 'Leagues are v2.0 — no screen imports this yet.',
  'leagues/diamond': 'Leagues are v2.0 — no screen imports this yet.',
  'leagues/legend': 'Leagues are v2.0 — no screen imports this yet.',

  // Briefed for slots the app draws at 18 points — the icon inside a `Stat` chip —
  // against a style block whose own bar is "reads clearly at 96px". A 3D render with a
  // subsurface glow at 18pt is a smudge, and the flat Lucide icons in those chips are the
  // better answer at that size. The line is the SIZE, not the asset: `streak-flame` and
  // `streak-freeze` ship because the streak screen draws them at 72 and 64.
  'rewards/coin': 'Only ever drawn at 18pt, where an illustration cannot read.',
  'rewards/gem': 'Only ever drawn at 18pt, where an illustration cannot read.',
  'rewards/heart': 'Only ever drawn at 18pt, where an illustration cannot read.',
  'rewards/trophy': 'Only ever drawn at 18pt, where an illustration cannot read.',
  'rewards/xp-orb': 'Only ever drawn at 18pt, where an illustration cannot read.',

  'states/empty-no-friends':
    'Friends are v2.0, so the empty state this illustrates has no screen to appear on.',
}
