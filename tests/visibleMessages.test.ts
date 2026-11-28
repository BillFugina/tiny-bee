import { describe, expect, it } from 'vitest'
import { visibleMessages } from '../server/agent/checkin.js'

const use = (id: string, step: string) => ({ type: 'tool_use', id, name: 'offer_step_button', input: { step } })
const result = (id: string, isError = false) => ({ type: 'tool_result', tool_use_id: id, is_error: isError })

describe('visibleMessages', () => {
  it('puts an offered step on the last reply of that turn', () => {
    const out = visibleMessages([
      { id: 1, role: 'user', content: [{ type: 'text', text: "That's it" }], text: "That's it" },
      { id: 2, role: 'assistant', content: [use('a', 'invite')], text: null },
      { id: 3, role: 'user', content: [result('a')], text: null },
      { id: 4, role: 'assistant', content: [{ type: 'text', text: 'Ready to invite?' }], text: 'Ready to invite?' },
    ])
    expect(out).toEqual([
      { id: 1, role: 'user', text: "That's it" },
      { id: 4, role: 'assistant', text: 'Ready to invite?', offer: 'invite' },
    ])
  })

  it('drops an offer whose call failed, and keeps offers within their own turn', () => {
    const out = visibleMessages([
      { id: 1, role: 'user', content: [], text: 'Hi' },
      { id: 2, role: 'assistant', content: [use('a', 'towns')], text: null },
      { id: 3, role: 'user', content: [result('a', true)], text: null },
      { id: 4, role: 'assistant', content: [], text: 'Not yet.' },
      { id: 5, role: 'user', content: [], text: 'Nothing else' },
      { id: 6, role: 'assistant', content: [use('b', 'invite')], text: 'Invite them next.' },
      { id: 7, role: 'user', content: [result('b')], text: null },
    ])
    expect(out.map((m) => m.offer)).toEqual([undefined, undefined, undefined, 'invite'])
  })

  it('ignores a step it does not know', () => {
    const out = visibleMessages([
      { id: 1, role: 'user', content: [], text: 'Hi' },
      { id: 2, role: 'assistant', content: [use('a', 'vote')], text: 'Hello' },
    ])
    expect(out[1]).not.toHaveProperty('offer')
  })
})
