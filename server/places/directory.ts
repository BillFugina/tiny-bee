import { distanceKm, type LatLng } from '../../domain/fairness/geo.js'

/**
 * Towns people can start from and meet in. The data is a trimmed GeoNames
 * extract (see scripts/build-towns.ts); this module only searches it.
 */
export type Town = {
  /** GeoNames id, stable across data refreshes. */
  id: number
  name: string
  /** State or province code: "NC" in the US, a GeoNames admin code elsewhere. */
  region: string
  /** ISO 3166 country code. */
  country: string
  lat: number
  lng: number
  population: number
}

/** The compact form stored in towns.json: [id, name, region, country, lat, lng, population]. */
export type TownRow = readonly [number, string, string, string, number, number, number]

export interface TownDirectory {
  /** Towns whose name starts with the query, biggest first. "Raleigh, NC" narrows by region or country. */
  search(query: string, limit?: number): Town[]
  get(id: number): Town | undefined
  /** Towns within radiusKm of a point, nearest first. */
  near(center: LatLng, radiusKm: number): Town[]
}

/** "Raleigh, NC" in the US, "Lyon, FR" elsewhere. */
export function townLabel(town: Pick<Town, 'name' | 'region' | 'country'>): string {
  return town.country === 'US' && town.region ? `${town.name}, ${town.region}` : `${town.name}, ${town.country}`
}

export function createTownDirectory(rows: readonly TownRow[]): TownDirectory {
  const towns: Town[] = rows.map(([id, name, region, country, lat, lng, population]) => ({
    id,
    name,
    region,
    country,
    lat,
    lng,
    population,
  }))
  const byId = new Map(towns.map((t) => [t.id, t]))
  const keys = towns.map((t) => ({ town: t, name: fold(t.name), region: fold(t.region), country: fold(t.country) }))

  return {
    search(query, limit = 8) {
      const [namePart = '', ...rest] = query.split(',').map(fold)
      if (namePart.length < 2) return []
      const qualifier = rest.join(' ').trim()
      return keys
        .filter((k) => k.name.startsWith(namePart))
        .filter((k) => !qualifier || k.region.startsWith(qualifier) || k.country.startsWith(qualifier))
        .sort(
          (a, b) =>
            Number(b.name === namePart) - Number(a.name === namePart) ||
            b.town.population - a.town.population ||
            a.town.id - b.town.id,
        )
        .slice(0, limit)
        .map((k) => k.town)
    },

    get(id) {
      return byId.get(id)
    },

    near(center, radiusKm) {
      // Cheap latitude band first (1 degree of latitude is about 111 km), then the real distance.
      const band = radiusKm / 111
      return towns
        .filter((t) => Math.abs(t.lat - center.lat) <= band)
        .map((t) => ({ t, d: distanceKm(center, t) }))
        .filter(({ d }) => d <= radiusKm)
        .sort((a, b) => a.d - b.d || a.t.id - b.t.id)
        .map(({ t }) => t)
    },
  }
}

/** Lowercase without accents, so "sao paulo" finds "São Paulo". */
function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
}
