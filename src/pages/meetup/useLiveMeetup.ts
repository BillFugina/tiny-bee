import { useQueryClient } from '@tanstack/react-query'
import { TRPCClientError } from '@trpc/client'
import { useEffect } from 'react'
import { useTRPC, useTRPCClient } from '../../lib/trpc'

const REFRESH_DEBOUNCE_MS = 300
const RENEW_BEFORE_EXPIRY_MS = 60_000
const MAX_BACKOFF_MS = 30_000

/**
 * Keeps a meetup page current: when anyone in the meetup changes something,
 * this page refetches. Listens on Ably's event stream with a short-lived,
 * subscribe-only token from the server. Messages carry no data; the refetch
 * goes through tRPC like any other. When live updates are off (no key on the
 * server) this does nothing and the page behaves as before.
 */
export function useLiveMeetup(meetupId: string) {
  const client = useTRPCClient()
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    let stopped = false
    let source: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let renewTimer: ReturnType<typeof setTimeout> | undefined
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    let lastEventId: string | undefined
    let failures = 0

    const refreshSoon = () => {
      clearTimeout(refreshTimer)
      refreshTimer = setTimeout(() => {
        // The same queries the page refreshes after a member's own change.
        for (const queryKey of [
          trpc.meetups.pathKey(),
          trpc.shortlist.pathKey(),
          trpc.vote.pathKey(),
          trpc.invites.list.pathKey(),
        ]) {
          void queryClient.invalidateQueries({ queryKey })
        }
      }, REFRESH_DEBOUNCE_MS)
    }

    const close = () => {
      source?.close()
      source = null
      clearTimeout(renewTimer)
    }

    const retry = () => {
      close()
      if (stopped) return
      failures += 1
      const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(failures - 1, 5))
      retryTimer = setTimeout(() => void connect(), delay)
    }

    const connect = async () => {
      let live: Awaited<ReturnType<typeof client.live.token.query>>
      try {
        live = await client.live.token.query({ meetupId })
      } catch (error) {
        // Not signed in or not a member: retrying won't help.
        const code = error instanceof TRPCClientError ? (error.data as { code?: string } | undefined)?.code : undefined
        if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || code === 'NOT_FOUND') return
        if (!stopped) retry()
        return
      }
      if (stopped || !live) return // Live updates are off on the server.

      const params = new URLSearchParams({
        channels: live.channel,
        v: '1.2',
        accessToken: live.token,
        enveloped: 'false',
      })
      // Picks up anything sent while we were reconnecting.
      if (lastEventId) params.set('lastEvent', lastEventId)
      const stream = new EventSource(`https://${live.host}/sse?${params.toString()}`)
      source = stream

      stream.onopen = () => {
        // After a gap, catch up on anything that changed meanwhile.
        if (failures > 0) refreshSoon()
        failures = 0
      }
      stream.onmessage = (event) => {
        if (event.lastEventId) lastEventId = event.lastEventId
        refreshSoon()
      }
      // Covers dropped connections and Ably's own error events (an expired
      // token included): start over with a fresh token.
      stream.onerror = () => {
        if (source === stream) retry()
      }

      // Swap to a fresh token a minute before this one runs out.
      const renewIn = Math.max(5_000, live.expires - Date.now() - RENEW_BEFORE_EXPIRY_MS)
      renewTimer = setTimeout(() => {
        if (source !== stream || stopped) return
        close()
        void connect()
      }, renewIn)
    }

    void connect()
    return () => {
      stopped = true
      clearTimeout(retryTimer)
      clearTimeout(refreshTimer)
      close()
    }
  }, [client, trpc, queryClient, meetupId])
}
