/**
 * The name other people see, and why nobody has to moderate it.
 *
 * ## The rule this exists to satisfy
 *
 * `docs/systems/social-and-leagues.md` opens with a prerequisite in bold: "moderation,
 * reporting, and blocking ship *with* the social graph, not after it. A kids' app with
 * unsupervised social features is a headline waiting to happen." Its safety table adds:
 * "No user-authored display text beyond a handle, which is moderated."
 *
 * A moderated handle needs a queue, a policy, an appeals path and somebody reading it on
 * a Sunday. This product has none of those and will not have them for a leaderboard.
 *
 * So the handle is not authored. It is ASSIGNED, deterministically, from two curated word
 * lists — and that is not a stopgap for real moderation, it is strictly stronger than it.
 * There is no free text anywhere in the feature, so there is no user-generated content to
 * moderate, nothing to report, and nobody to block. The surface is removed rather than
 * policed, which is the only version of this that a ten-year-old's parent should have to
 * trust.
 *
 * A user who wants to be called something else can be, on the one screen where it hurts
 * nobody: their own profile, visible to nobody but them. The league shows the handle.
 *
 * ## The word lists
 *
 * Both are geography-and-exploration nouns and neutral adjectives, checked one at a time
 * by hand for the obvious failure mode — a pairing that reads as an insult, a slur, a
 * body part, or a brand. They are deliberately dull. A handle is an identifier, and the
 * funniest possible word list is the one most likely to produce something regrettable in
 * a language nobody on the team reads.
 *
 * `ADJECTIVES` × `NOUNS` × 100 is 65 × 60 × 100 = 390,000 handles, which is enough that a
 * collision inside a 30-person cohort is a rounding error, and the number is what the
 * cohort assignment retries against on the server.
 *
 * ## Deterministic, so it survives a reinstall
 *
 * Derived from the user id, so the same person is the same explorer on every device and
 * after restoring a backup — a leaderboard where you get a new name every week is a
 * leaderboard where you cannot recognise yourself.
 */

/**
 * Neutral, and boring on purpose. No nationalities, no body words, no anything that
 * pairs badly.
 */
export const ADJECTIVES = [
  'amber', 'arctic', 'bold', 'brave', 'bright', 'brisk', 'calm', 'cheerful', 'clever',
  'cobalt', 'coral', 'cosmic', 'curious', 'daring', 'dawn', 'deft', 'dusty', 'eager',
  'early', 'emerald', 'far', 'fleet', 'gentle', 'golden', 'granite', 'hardy', 'high',
  'jade', 'keen', 'kind', 'lively', 'lunar', 'mellow', 'merry', 'misty', 'noble',
  'north', 'olive', 'opal', 'patient', 'quick', 'quiet', 'rapid', 'ready', 'roving',
  'ruby', 'sage', 'sandy', 'silver', 'snowy', 'solar', 'south', 'spry', 'steady',
  'sunny', 'swift', 'tidy', 'tranquil', 'true', 'vivid', 'wandering', 'warm', 'west',
  'wild', 'wise',
] as const

/** Things that explore, or that get explored. Nothing that can be a person. */
export const NOUNS = [
  'atlas', 'basin', 'bay', 'beacon', 'bluff', 'canyon', 'cape', 'cavern', 'channel',
  'cliff', 'coast', 'compass', 'cove', 'crater', 'creek', 'delta', 'dune', 'estuary',
  'fjord', 'forest', 'geyser', 'glacier', 'glade', 'gorge', 'grove', 'harbour',
  'highland', 'hollow', 'inlet', 'island', 'isthmus', 'lagoon', 'lake', 'lantern',
  'ledge', 'marsh', 'meadow', 'mesa', 'moor', 'oasis', 'orbit', 'peak', 'plateau',
  'prairie', 'quarry', 'rapids', 'reef', 'ridge', 'river', 'savanna', 'sextant',
  'shoal', 'sound', 'spring', 'steppe', 'strait', 'summit', 'tundra', 'valley', 'wharf',
] as const

/** The number of distinct handles this scheme can produce. */
export const HANDLE_SPACE = ADJECTIVES.length * NOUNS.length * 100

/**
 * A stable 32-bit hash. FNV-1a, the same one the daily quest seeds with.
 *
 * Not cryptographic and does not need to be: the only property required is that the same
 * input gives the same answer on every device and in every runtime. It is NOT a secret —
 * a handle is public by definition, and anyone holding a user id could compute it. What
 * matters is the other direction, and a hash does not make a user id recoverable from
 * three words.
 */
function hash(input: string): number {
  let value = 2166136261
  for (const char of input) {
    value ^= char.charCodeAt(0)
    value = Math.imul(value, 16777619)
  }
  return value >>> 0
}

/**
 * The handle for a user, as `Swift Glacier 42`.
 *
 * `salt` exists for the one case the server needs: two users in the same cohort hashing
 * to the same handle. The server retries with an incrementing salt until the cohort's
 * handles are distinct, which keeps the scheme deterministic per (user, cohort) without
 * needing a global uniqueness index over 390,000 strings.
 *
 * Title case rather than a slug: this is a NAME, shown to a person, and `swift-glacier-42`
 * reads as a database key. The number is padded to two digits so a column of them lines up.
 */
export function handleFor(userId: string, salt = 0): string {
  const seed = hash(salt === 0 ? userId : `${userId}#${salt}`)
  const adjective = ADJECTIVES[seed % ADJECTIVES.length]!
  const noun = NOUNS[Math.floor(seed / ADJECTIVES.length) % NOUNS.length]!
  const number = Math.floor(seed / (ADJECTIVES.length * NOUNS.length)) % 100

  const title = (word: string): string => word.charAt(0).toUpperCase() + word.slice(1)
  return `${title(adjective)} ${title(noun)} ${String(number).padStart(2, '0')}`
}
