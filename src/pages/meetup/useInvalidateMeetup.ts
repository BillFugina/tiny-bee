import { useQueryClient } from '@tanstack/react-query'
import { useTRPC } from '../../lib/trpc'

/** Refreshes everything the meetup page shows after a change. */
export function useInvalidateMeetup() {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.meetups.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.shortlist.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.vote.pathKey() }),
    ])
}
