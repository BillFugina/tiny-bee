import type { TownRow } from '../../server/places/directory.js'

// Made-up towns on a line of latitude, about 91 km apart, so travel estimates
// are easy to reason about. Not real places.
export const fixtureTowns: TownRow[] = [
  [1, 'Westford', 'NC', 'US', 35.0, -80.0, 50_000],
  [2, 'Midway', 'NC', 'US', 35.0, -79.5, 8_000],
  [3, 'Eastford', 'NC', 'US', 35.0, -79.0, 40_000],
  [4, 'Westfield', 'VA', 'US', 37.0, -80.0, 120_000],
  [5, 'Westford', 'MA', 'US', 42.6, -71.4, 24_000],
  [6, 'São Bento', '27', 'BR', -23.5, -46.6, 30_000],
  [7, 'Farport', 'ME', 'US', 44.0, -69.0, 3_000],
]
