import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { z } from 'zod'
import { CHECKIN_TEXT_MAX, checkinSendInput } from '../../../shared/schemas'
import { useTRPC } from '../../lib/trpc'
import { FieldErrors } from './FieldErrors'
import { useInvalidateMeetup } from './useInvalidateMeetup'

const messageForm = z.object({ text: checkinSendInput.shape.text })

/** The member's private chat with the planner agent. */
export function CheckIn({ meetupId }: { meetupId: string }) {
  const trpc = useTRPC()
  const queryClient = useQueryClient()
  const invalidateMeetup = useInvalidateMeetup()
  const history = useQuery(trpc.checkin.history.queryOptions({ meetupId }))
  const historyKey = trpc.checkin.history.queryKey({ meetupId })
  const send = useMutation(
    trpc.checkin.send.mutationOptions({
      onSuccess: async (result) => {
        queryClient.setQueryData(historyKey, (old) =>
          old ? { ...old, messages: [...old.messages, ...result.messages] } : old,
        )
        // The planner may have saved a start or added to the shortlist.
        await invalidateMeetup()
      },
    }),
  )
  const form = useForm({
    defaultValues: { text: '' },
    validators: { onSubmit: messageForm },
    onSubmit: async ({ value, formApi }) => {
      try {
        await send.mutateAsync({ meetupId, text: value.text })
        formApi.reset()
      } finally {
        // The Send button is disabled while the planner answers, which drops
        // focus when it was clicked; put the cursor back to keep chatting.
        input.current?.focus()
      }
    },
  })

  const input = useRef<HTMLTextAreaElement>(null)
  const end = useRef<HTMLLIElement>(null)
  const count = history.data?.messages.length ?? 0
  useEffect(() => {
    if (count > 0 || send.isPending) end.current?.scrollIntoView({ block: 'nearest' })
  }, [count, send.isPending])

  if (history.isPending) return null
  if (!history.data) return <p className="error">{history.error?.message ?? 'Could not load your check-in.'}</p>

  if (!history.data.enabled) {
    return (
      <div className="card">
        <h2>Check in with the planner</h2>
        <p className="muted">The planner chat isn't switched on for this app yet.</p>
      </div>
    )
  }

  const { messages } = history.data
  return (
    <div className="card">
      <h2>Check in with the planner</h2>
      <p className="muted small">
        Only you see this chat. Tell the planner where you're starting from and anything that matters to you, like a
        budget or a time you need to leave.
      </p>
      <ul className="chat" aria-live="polite">
        {messages.length === 0 && !send.isPending ? (
          <li className="bubble planner">Hi! Where will you be coming from, and how long a drive is fine for you?</li>
        ) : null}
        {messages.map((m) => (
          <li key={m.id} className={`bubble ${m.role === 'user' ? 'me' : 'planner'}`}>
            <Linked text={m.text} />
          </li>
        ))}
        {send.isPending ? (
          <>
            <li className="bubble me">{send.variables.text}</li>
            <li className="bubble planner muted">Thinking…</li>
          </>
        ) : null}
        <li ref={end} className="chat-end" aria-hidden="true" />
      </ul>
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault()
          void form.handleSubmit()
        }}
      >
        <form.Field name="text">
          {(field) => (
            <label>
              <span className="sr-only">Message the planner</span>
              <textarea
                ref={input}
                value={field.state.value}
                rows={2}
                maxLength={CHECKIN_TEXT_MAX}
                placeholder="Like: I'm in Durham and can drive about an hour"
                // readOnly rather than disabled, so the box keeps focus while
                // the planner answers.
                readOnly={send.isPending}
                aria-busy={send.isPending}
                onBlur={field.handleBlur}
                onChange={(e) => field.handleChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    if (!send.isPending) void form.handleSubmit()
                  }
                }}
              />
              <FieldErrors errors={field.state.meta.errors} />
            </label>
          )}
        </form.Field>
        <div className="row">
          <button type="submit" disabled={send.isPending}>
            {send.isPending ? 'Sending…' : 'Send'}
          </button>
          {send.error ? <span className="error">{send.error.message}</span> : null}
        </div>
      </form>
    </div>
  )
}

/**
 * Turns this app's own links in a planner reply (like the invite link) into
 * links. Any other address stays plain text, since a reply can quote words
 * other members wrote.
 */
function Linked({ text }: { text: string }) {
  const origin = window.location.origin
  return (
    <>
      {text.split(/(https?:\/\/[^\s<>"]+)/).map((part, i) => {
        const href = part.replace(/[.,!?;:)]+$/, '')
        if (i % 2 === 0 || !href.startsWith(`${origin}/`)) return part
        return (
          <span key={i}>
            <a href={href}>{href}</a>
            {part.slice(href.length)}
          </span>
        )
      })}
    </>
  )
}
