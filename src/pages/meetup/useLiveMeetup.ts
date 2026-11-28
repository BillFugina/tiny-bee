import { useQueryClient } from '@tanstack/react-query'
import { TRPCClientError } from '@trpc/client'
import { useEffect } from 'react'
import { backoffMs, MAX_STREAM_FAILURES, STREAM_STABLE_MS, streamErrorAction } from '../../../shared/liveStream'
import { useTRPC, useTRPCClient } from '../../lib/trpc'

const REFRESH_DEBOUNCE_MS = 300
const RENEW_BEFORE_EXPIRY_MS = 60_000

/**
 * Keeps a meetup page current by push only: when anyone in the meetup changes
 * something, the server publishes to Ably and this page refetches. It never
 * polls. Listens on Ably's event stream with a short-lived, subscribe-only
 * token from the server. Messages carry no data; the refetch goes through
 * tRPC like any other. When live updates are off (no key on the server) this
 * does nothing and the page behaves as before.
 *
 * Costs nothing while the stream is healthy. When it isn't, it backs off
 * (2s, 4s, 8s … up to a minute), stops after a few failures in a row or as
 * soon as Ably refuses outright, and closes the stream while the tab is
 * hidden. A gap is caught up with at most one refetch, and only once the new
 * stream has stayed up, so a stream that keeps dropping can't loop.
 */
export function useLiveMeetup(meetupId: string) {
  const client = useTRPCClient()
  const trpc = useTRPC()
  const queryClient = useQueryClient()

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    let stopped = false // unmounted
    let refused = false // retrying can't help (Ably or the server said no): stop until reload
    let resting = false // too many failures in a row: stop until the tab is shown again
    let source: EventSource | null = null
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let renewTimer: ReturnType<typeof setTimeout> | undefined
    let stableTimer: ReturnType<typeof setTimeout> | undefined
    let refreshTimer: ReturnType<typeof setTimeout> | undefined
    let lastEventId: string | undefined
    let failures = 0
    let missedSomething = false // a gap that one refetch should cover

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
      clearTimeout(stableTimer)
    }

    const hidden = () => document.visibilityState === 'hidden'
    const idle = () => stopped || refused || resting || hidden() || source !== null

    const retry = () => {
      close()
      if (stopped || refused) return
      failures += 1
      missedSomething = true
      if (failures > MAX_STREAM_FAILURES) {
        resting = true
        return
      }
      clearTimeout(retryTimer)
      retryTimer = setTimeout(() => void connect(), backoffMs(failures))
    }

    const connect = async () => {
      if (idle()) return
      let live: Awaited<ReturnType<typeof client.live.token.query>>
      try {
        live = await client.live.token.query({ meetupId })
      } catch (error) {
        // Not signed in or not a member: retrying won't help.
        const code = error instanceof TRPCClientError ? (error.data as { code?: string } | undefined)?.code : undefined
        if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || code === 'NOT_FOUND') refused = true
        else retry()
        return
      }
      if (idle()) return
      if (!live) {
        refused = true // Live updates are off on the server.
        return
      }

      const params = new URLSearchParams({
        channels: live.channel,
        v: '1.2',
        accessToken: live.token,
        enveloped: 'false',
      })
      // Ably replays anything sent while we were away, if it still has it.
      if (lastEventId) params.set('lastEvent', lastEventId)
      const stream = new EventSource(`https://${live.host}/sse?${params.toString()}`)
      source = stream

      stream.onopen = () => {
        // Only a stream that stays up resets the backoff and catches up, so
        // one that opens and drops straight away can't loop.
        clearTimeout(stableTimer)
        stableTimer = setTimeout(() => {
          if (source !== stream) return
          failures = 0
          if (missedSomething) refreshSoon()
          missedSomething = false
        }, STREAM_STABLE_MS)
      }
      stream.onmessage = (event) => {
        if (event.lastEventId) lastEventId = event.lastEventId
        refreshSoon()
      }
      // Dropped connections and Ably's own error events both land here. The
      // browser would reconnect by itself with the same token, so close it and
      // decide here instead.
      stream.onerror = (event) => {
        if (source !== stream) return
        const action = streamErrorAction((event as MessageEvent).data)
        if (action === 'stop') {
          close()
          refused = true
        } else if (action === 'renew') {
          close()
          missedSomething = true
          void connect()
        } else {
          retry()
        }
      }

      // Swap to a fresh token a minute before this one runs out.
      const renewIn = Math.max(5_000, live.expires - Date.now() - RENEW_BEFORE_EXPIRY_MS)
      renewTimer = setTimeout(() => {
        if (source !== stream || stopped) return
        close()
        void connect()
      }, renewIn)
    }

    // No stream while the tab is hidden. Coming back starts over; the page's
    // own refetch-on-focus covers anything that changed meanwhile.
    const onVisibility = () => {
      if (hidden()) {
        clearTimeout(retryTimer)
        close()
        return
      }
      resting = false
      failures = 0
      void connect()
    }
    document.addEventListener('visibilitychange', onVisibility)

    void connect()
    return () => {
      stopped = true
      document.removeEventListener('visibilitychange', onVisibility)
      clearTimeout(retryTimer)
      clearTimeout(refreshTimer)
      close()
    }
  }, [client, trpc, queryClient, meetupId])
}
