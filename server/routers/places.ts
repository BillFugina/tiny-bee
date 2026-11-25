import { townLabel } from '../places/directory.js'
import { townSearchInput } from '../../shared/schemas.js'
import { protectedProcedure, router } from '../trpc.js'

export const placesRouter = router({
  /** Town autocomplete for a member's start. */
  search: protectedProcedure
    .input(townSearchInput)
    .query(({ ctx, input }) => ctx.towns.search(input.q).map((t) => ({ id: t.id, label: townLabel(t) }))),
})
