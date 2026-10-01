import { buildIndex, type Entity, type Fact, type Template } from '@worldquest/engines'
import entities from '../../content/packs/geography/entities.countries.v1.json'
import capitals from '../../content/packs/geography/facts.capitals.v1.json'
import flags from '../../content/packs/geography/facts.flags.v1.json'
import currencies from '../../content/packs/geography/facts.currencies.v1.json'
import locations from '../../content/packs/geography/facts.locations.v1.json'
import languages from '../../content/packs/geography/facts.languages.v1.json'
import callingCodes from '../../content/packs/geography/facts.calling-codes.v1.json'
import area from '../../content/packs/geography/facts.area.v1.json'
import borderCount from '../../content/packs/geography/facts.border-count.v1.json'
import borders from '../../content/packs/geography/facts.borders.v1.json'
import landlocked from '../../content/packs/geography/facts.landlocked.v1.json'
import hemisphere from '../../content/packs/geography/facts.hemisphere.v1.json'
import tld from '../../content/packs/geography/facts.tld.v1.json'
import alpha3 from '../../content/packs/geography/facts.alpha3.v1.json'
import currencyCodes from '../../content/packs/geography/facts.currency-codes.v1.json'
import nativeNames from '../../content/packs/geography/facts.native-names.v1.json'
import companies from '../../content/packs/geography/facts.companies.v1.json'
import athletes from '../../content/packs/geography/facts.athletes.v1.json'
import musicians from '../../content/packs/geography/facts.musicians.v1.json'
import actors from '../../content/packs/geography/facts.actors.v1.json'
import scientists from '../../content/packs/geography/facts.scientists.v1.json'
import writers from '../../content/packs/geography/facts.writers.v1.json'
import artists from '../../content/packs/geography/facts.artists.v1.json'
import landmarks from '../../content/packs/geography/facts.landmarks.v1.json'
import clubs from '../../content/packs/geography/facts.clubs.v1.json'
import highestPoints from '../../content/packs/geography/facts.highest-points.v1.json'
import templates from '../../content/packs/geography/templates.v1.json'

// Static packs pass the repository's schema/crosscheck gate before deployment.
const loadedEntities: Entity[] = entities.items.map(entity => ({ ...entity,
  assets: Object.fromEntries(Object.entries(entity.assets).map(([key, asset]) => [key, { path: asset.path, license: asset.licenseRef }])) }))
/** The packs the mobile app ships too: what a learner can SEE on a screen of their own. */
const appFacts = [capitals, flags, currencies, locations, languages, callingCodes, nativeNames]
  .flatMap(pack => pack.items as Fact[])
/** The `delivery: "server"` packs: ranked people, companies and places, composed here and nowhere else. */
const serverFacts = [hemisphere, area, borderCount, landlocked, borders, tld, alpha3, currencyCodes, companies, athletes, musicians, actors, scientists, writers, artists, landmarks, clubs, highestPoints]
  .flatMap(pack => pack.items as Fact[])
const templateList = templates.items as Template[]

/** Everything the Worker can ask a learner: lessons, tickets and the level check. */
export const learningContent = buildIndex({ entities: loadedEntities, facts: [...appFacts, ...serverFacts], templates: templateList })

/**
 * What the app can also put on its own screens: the daily quest and friend challenges.
 *
 * A quest names its facts and the app draws them beside the learner's progress, and a friend
 * challenge is played on a screen that shows four options, so both draw from the packs the app
 * ships. The fame packs would make "Which country is Messi from?" a quest task on a phone that
 * has never heard of him, and a challenge could carry a matching board its screen cannot draw.
 * Lessons are different: the Worker issues those question by question, and the app draws
 * whatever it is handed.
 */
export const questContent = buildIndex({ entities: loadedEntities, facts: appFacts, templates: templateList })
