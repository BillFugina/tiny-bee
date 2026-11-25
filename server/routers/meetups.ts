import { desc, eq } from 'drizzle-orm'
import { meetup, meetupMember } from '../db/schema.js'
import { createMeetupInput } from '../../shared/schemas.js'
import { protectedProcedure, router } from '../trpc.js'

export const meetupsRouter = router({
  create: protectedProcedure.input(createMeetupInput).mutation(async ({ ctx, input }) => {
    const [created] = await ctx.db
      .insert(meetup)
      .values({ title: input.title, organizerId: ctx.user.id })
      .returning({ id: meetup.id, title: meetup.title, createdAt: meetup.createdAt })
    if (!created) throw new Error('Insert returned no row')
    // neon-http has no interactive transactions; a failed second insert leaves
    // a meetup with no member row, which listMine ignores. Fine for the skeleton.
    await ctx.db.insert(meetupMember).values({ meetupId: created.id, userId: ctx.user.id, role: 'organizer' })
    return created
  }),

  listMine: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({ id: meetup.id, title: meetup.title, role: meetupMember.role, createdAt: meetup.createdAt })
      .from(meetupMember)
      .innerJoin(meetup, eq(meetup.id, meetupMember.meetupId))
      .where(eq(meetupMember.userId, ctx.user.id))
      .orderBy(desc(meetup.createdAt)),
  ),
})
