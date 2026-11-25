/** node-postgres and neon-http both answer execute() with an object holding rows. */
export async function rows<T = Record<string, unknown>>(query: PromiseLike<unknown>): Promise<T[]> {
  const result = (await query) as { rows?: T[] }
  return result.rows ?? []
}
