/**
 * Writes server/places/towns.json from the `all-the-cities` package
 * (GeoNames "cities1000" data, CC BY 4.0: https://www.geonames.org/).
 *
 * Keeps every US town the package has, plus towns elsewhere with at least
 * WORLD_MIN_POPULATION people, so the file stays small enough to bundle into
 * the API function. Each row is [id, name, region, country, lat, lng, population],
 * matching TownRow in server/places/directory.ts.
 *
 *   npm run towns:build
 */
import { writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import type { TownRow } from '../server/places/directory.js'

type City = {
  cityId: number
  name: string
  country: string
  featureCode: string
  adminCode: string
  population: number
  loc: { coordinates: [number, number] } // [lng, lat]
}

const WORLD_MIN_POPULATION = 15_000
// Historical, abandoned, destroyed and "section of a place" entries aren't somewhere to meet.
const SKIP_FEATURES = new Set(['PPLX', 'PPLH', 'PPLQ', 'PPLW', 'PPLCH'])

const cities = createRequire(import.meta.url)('all-the-cities') as City[]
const round = (n: number) => Math.round(n * 1e4) / 1e4 // about 11 m

const rows: TownRow[] = cities
  .filter((c) => !SKIP_FEATURES.has(c.featureCode))
  .filter((c) => c.country === 'US' || c.population >= WORLD_MIN_POPULATION)
  .map((c) => {
    const [lng, lat] = c.loc.coordinates
    const region = c.country === 'US' ? c.adminCode : ''
    return [c.cityId, c.name, region, c.country, round(lat), round(lng), c.population] as const
  })
  .sort((a, b) => a[0] - b[0])

const out = fileURLToPath(new URL('../server/places/towns.json', import.meta.url))
writeFileSync(out, `[\n${rows.map((r) => JSON.stringify(r)).join(',\n')}\n]\n`)
console.log(`[towns] wrote ${rows.length} towns to server/places/towns.json`)
