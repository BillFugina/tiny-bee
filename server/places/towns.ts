import { createTownDirectory, type TownDirectory, type TownRow } from './directory.js'
import rows from './towns.json' with { type: 'json' }

let directory: TownDirectory | undefined

/** The bundled town list, indexed on first use. */
export function towns(): TownDirectory {
  directory ??= createTownDirectory(rows as unknown as readonly TownRow[])
  return directory
}
