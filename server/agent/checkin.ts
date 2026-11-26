import Anthropic from '@anthropic-ai/sdk'
import { TRPCError } from '@trpc/server'
import { and, asc, count, eq, isNotNull, sql } from 'drizzle-orm'
import type { Db } from '../db/client.js'
import { checkinMessage, meetupMember, user } from '../db/schema.js'
import { getMeetupState, requireMember } from '../meetups/members.js'
import { rows } from '../meetups/sql.js'
import type { TownDirectory } from '../places/directory.js'
import type { ModelResponse, PlannerConfig, PlannerModel } from './model.js'
import { plannerSystemPrompt } from './prompt.js'
import { plannerToolDefinitions, runPlannerTool } from './tools.js'

type MessageParam = Anthropic.Beta.Messages.BetaMessageParam
type ContentBlock = Anthropic.Beta.Messages.BetaContentBlock
type ToolResult = Anthropic.Beta.Messages.BetaToolResultBlockParam

/** Most model calls in one turn, so a confused loop can't run up a bill. */
export const MAX_STEPS = 8
/** Most messages a member can send in one check-in. */
export const MESSAGES_MAX = 60
/** A turn left marked busy longer than this (a crashed function) stops blocking. */
const BUSY_TIMEOUT = sql`interval '5 minutes'`

export const DEFAULT_PLANNER: PlannerConfig = { model: 'claude-opus-5-5', effort: 'low' }

/** The chat as the member sees it: their messages and the planner's replies. */
export async function checkinHistory(db: Db, meetupId: string, userId: string, enabled: boolean) {
  await requireMember(db, meetupId, userId)
  const messages = await db
    .select({ id: checkinMessage.id, role: checkinMessage.role, text: checkinMessage.text })
    .from(checkinMessage)
    .where(
      and(eq(checkinMessage.meetupId, meetupId), eq(checkinMessage.userId, userId), isNotNull(checkinMessage.text)),
    )
    .orderBy(asc(checkinMessage.id))
  return { enabled, messages: messages.map((m) => ({ id: m.id, role: m.role, text: m.text ?? '' })) }
}

interface StoredMessage {
  role: 'user' | 'assistant'
  content: unknown[]
  text: string | null
}

/**
 * After a fallback to another model partway through a reply, the API wants
 * thinking and tool calls from before the switch left out when the reply is
 * sent back. Anything after the last fallback marker, and the marker itself,
 * stays where it was.
 */
export function echoable(content: ContentBlock[]): ContentBlock[] {
  let boundary = -1
  content.forEach((b, i) => {
    if (b.type === 'fallback') boundary = i
  })
  if (boundary <= 0) return content
  const dropBefore = new Set(['thinking', 'redacted_thinking', 'tool_use'])
  return content.filter((b, i) => i >= boundary || !dropBefore.has(b.type))
}

const visibleText = (content: ContentBlock[]) =>
  content
    .flatMap((b) => (b.type === 'text' ? [b.text.trim()] : []))
    .filter(Boolean)
    .join('\n\n') || null

/**
 * One turn of a member's private check-in: their message, then the planner
 * thinking and calling tools until it replies. The whole turn is saved in one
 * statement at the end, so a failure leaves the stored conversation as it was
 * (tools that already ran, like saving a start, keep their effect).
 */
export async function sendCheckin(
  db: Db,
  towns: TownDirectory,
  planner: { model: PlannerModel; config: PlannerConfig } | null,
  input: { meetupId: string; text: string },
  userId: string,
) {
  const { meetupId } = input
  await requireMember(db, meetupId, userId)
  if (!planner) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: "The planner isn't switched on yet." })
  }

  const [sent] = await db
    .select({ n: count() })
    .from(checkinMessage)
    .where(
      and(
        eq(checkinMessage.meetupId, meetupId),
        eq(checkinMessage.userId, userId),
        eq(checkinMessage.role, 'user'),
        isNotNull(checkinMessage.text),
      ),
    )
  if ((sent?.n ?? 0) >= MESSAGES_MAX) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'This check-in has reached its message limit.' })
  }

  // Claim the turn. Concurrent sends from the same member queue on this row,
  // and only one finds it free.
  const claimed = await rows(
    db.execute(sql`
      update ${meetupMember} set checkin_busy_since = now()
      where meetup_id = ${meetupId} and user_id = ${userId}
        and (checkin_busy_since is null or checkin_busy_since < now() - ${BUSY_TIMEOUT})
      returning user_id
    `),
  )
  if (claimed.length === 0) {
    throw new TRPCError({ code: 'CONFLICT', message: 'Still answering your last message.' })
  }

  try {
    const [{ title }, [me], history] = await Promise.all([
      getMeetupState(db, meetupId),
      db.select({ name: user.name }).from(user).where(eq(user.id, userId)),
      db
        .select({ role: checkinMessage.role, content: checkinMessage.content })
        .from(checkinMessage)
        .where(and(eq(checkinMessage.meetupId, meetupId), eq(checkinMessage.userId, userId)))
        .orderBy(asc(checkinMessage.id)),
    ])

    // The message goes to the model in exactly the form it's stored in, so the
    // next turn replays the same conversation byte for byte.
    const userContent = [{ type: 'text' as const, text: input.text }]
    const turn: StoredMessage[] = [{ role: 'user', content: userContent, text: input.text }]
    const messages: MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }) as MessageParam)
    messages.push({ role: 'user', content: userContent })

    const system = plannerSystemPrompt(title, me?.name ?? 'this member')
    const toolCtx = { db, towns, meetupId, userId }

    for (let step = 0; ; step++) {
      if (step >= MAX_STEPS) throw plannerFailed('The planner took too many steps on that one.')
      const response: ModelResponse = await callModel(planner.model, {
        model: planner.config.model,
        max_tokens: 16000,
        system,
        tools: plannerToolDefinitions,
        messages,
        output_config: { effort: planner.config.effort },
        cache_control: { type: 'ephemeral' },
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
      })

      if (response.stop_reason === 'refusal') throw plannerFailed("The planner can't help with that one.")
      if (response.stop_reason === 'max_tokens' || response.stop_reason === 'model_context_window_exceeded') {
        throw plannerFailed('The planner ran out of room on that one.')
      }

      const content = echoable(response.content)
      messages.push({ role: 'assistant', content } as MessageParam)
      turn.push({ role: 'assistant', content, text: visibleText(content) })

      if (response.stop_reason === 'pause_turn') continue
      const calls = content.filter((b): b is Anthropic.Beta.Messages.BetaToolUseBlock => b.type === 'tool_use')
      if (response.stop_reason !== 'tool_use' || calls.length === 0) break

      // All results go back together in one message.
      const results: ToolResult[] = []
      for (const call of calls) {
        const outcome = await runPlannerTool(toolCtx, call.name, call.input)
        results.push({ type: 'tool_result', tool_use_id: call.id, content: outcome.content, is_error: outcome.isError })
      }
      messages.push({ role: 'user', content: results })
      turn.push({ role: 'user', content: results, text: null })
    }

    const saved = await db
      .insert(checkinMessage)
      .values(turn.map((m) => ({ meetupId, userId, role: m.role, content: m.content, text: m.text })))
      .returning({ id: checkinMessage.id, role: checkinMessage.role, text: checkinMessage.text })
    return {
      messages: saved.flatMap((m) => (m.text === null ? [] : [{ id: m.id, role: m.role, text: m.text }])),
    }
  } finally {
    await db
      .update(meetupMember)
      .set({ checkinBusySince: null })
      .where(and(eq(meetupMember.meetupId, meetupId), eq(meetupMember.userId, userId)))
  }
}

async function callModel(model: PlannerModel, request: Parameters<PlannerModel['create']>[0]) {
  try {
    return await model.create(request)
  } catch (error) {
    if (!(error instanceof Anthropic.APIError)) throw error
    console.error('[planner] model call failed:', error.status, error.message)
    if (error.status === 401 || error.status === 403) {
      throw new TRPCError({ code: 'PRECONDITION_FAILED', message: "The planner's API key isn't working." })
    }
    if (error.status === undefined || error.status === 429 || error.status >= 500) {
      throw new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'The planner is busy. Try again in a minute.' })
    }
    throw error
  }
}

function plannerFailed(message: string) {
  return new TRPCError({ code: 'UNPROCESSABLE_CONTENT', message: `${message} Try saying it another way.` })
}
