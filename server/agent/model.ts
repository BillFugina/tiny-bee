import Anthropic from '@anthropic-ai/sdk'

// The planner talks to Claude through this one port, so tests can swap in a
// scripted model and never touch the network.

export type ModelRequest = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming
export type ModelResponse = Anthropic.Beta.Messages.BetaMessage

export interface PlannerModel {
  create(request: ModelRequest): Promise<ModelResponse>
}

export interface PlannerConfig {
  model: string
  effort: 'low' | 'medium' | 'high'
}

/** Claude through Anthropic's official SDK. */
export function anthropicPlanner(apiKey: string): PlannerModel {
  const client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 })
  return { create: (request) => client.beta.messages.create(request) }
}
