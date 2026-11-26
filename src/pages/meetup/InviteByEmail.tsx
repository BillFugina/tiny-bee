import { useForm } from '@tanstack/react-form'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { inviteEmailsField } from '../../../shared/schemas'
import { useTRPC } from '../../lib/trpc'
import { FieldErrors } from './FieldErrors'

type Status = 'sent' | 'already_member' | 'already_invited' | 'limit' | 'failed'

const STATUS_TEXT: Record<Status, string> = {
  sent: 'Invite sent',
  already_member: 'Already in this meetup',
  already_invited: 'Already invited today',
  limit: "Not sent: you've reached today's invite limit",
  failed: "Couldn't send. Try again in a bit.",
}

/** Addresses can be separated by commas, semicolons, spaces or new lines. */
function splitEmails(value: string): string[] {
  return value
    .split(/[\s,;]+/)
    .map((e) => e.trim())
    .filter(Boolean)
}

/** Emails the invite link, for people who'd rather not get it by text or chat. */
export function InviteByEmail({ meetupId }: { meetupId: string }) {
  const trpc = useTRPC()
  const available = useQuery(trpc.invites.available.queryOptions())
  const [results, setResults] = useState<{ email: string; status: Status }[]>([])
  const queryClient = useQueryClient()
  const send = useMutation(
    trpc.invites.send.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.invites.list.pathKey() }),
    }),
  )
  const form = useForm({
    defaultValues: { emails: '' },
    validators: {
      onSubmit: ({ value }) => {
        const parsed = inviteEmailsField.safeParse(splitEmails(value.emails))
        return parsed.success ? undefined : { fields: { emails: parsed.error.issues[0]?.message } }
      },
    },
    onSubmit: async ({ value, formApi }) => {
      const emails = inviteEmailsField.parse(splitEmails(value.emails))
      const sent = await send.mutateAsync({ meetupId, emails })
      setResults(sent)
      formApi.reset()
    },
  })

  if (!available.data?.available) return null
  return (
    <form
      className="invite-email"
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="emails">
        {(field) => (
          <label>
            Or invite by email
            <input
              type="text"
              inputMode="email"
              autoComplete="off"
              placeholder="name@example.com, another@example.com"
              value={field.state.value}
              onBlur={field.handleBlur}
              onChange={(e) => field.handleChange(e.target.value)}
            />
            <FieldErrors errors={field.state.meta.errors} />
          </label>
        )}
      </form.Field>
      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(isSubmitting) => (
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Sending…' : 'Send invites'}
          </button>
        )}
      </form.Subscribe>
      {send.error ? <span className="error">{send.error.message}</span> : null}
      {results.length > 0 ? (
        <ul className="invite-results" aria-live="polite">
          {results.map((r) => (
            <li key={r.email} className={r.status === 'sent' ? undefined : 'muted'}>
              {r.email}: {STATUS_TEXT[r.status]}
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  )
}
