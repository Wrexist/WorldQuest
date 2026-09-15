import { buildIndex, type Entity, type Fact, type Template } from '@worldquest/engines'
import entities from '../../content/packs/geography/entities.countries.v1.json'
import capitals from '../../content/packs/geography/facts.capitals.v1.json'
import flags from '../../content/packs/geography/facts.flags.v1.json'
import currencies from '../../content/packs/geography/facts.currencies.v1.json'
import locations from '../../content/packs/geography/facts.locations.v1.json'
import languages from '../../content/packs/geography/facts.languages.v1.json'
import callingCodes from '../../content/packs/geography/facts.calling-codes.v1.json'
import templates from '../../content/packs/geography/templates.v1.json'

// Static packs pass the repository's schema/crosscheck gate before deployment.
const loadedEntities: Entity[] = entities.items.map(entity => ({ ...entity,
  assets: Object.fromEntries(Object.entries(entity.assets).map(([key, asset]) => [key, { path: asset.path, license: asset.licenseRef }])) }))
export const learningContent = buildIndex({ entities: loadedEntities,
  facts: [capitals, flags, currencies, locations, languages, callingCodes].flatMap(pack => pack.items as Fact[]),
  templates: templates.items as Template[] })
