/** The OpenAI chat completion response shape, which is what clients of this gateway expect back. */
export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: {
    index: number;
    message: { role: 'assistant'; content: string | null };
    finish_reason: string | null;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    /** USD, as a decimal string so no precision is lost; "0" on a free-tier provider. Tollbooth-specific,
     *  additive to the OpenAI shape (see docs/architecture/usage-cost-engine.md). */
    estimated_cost: string;
  };
}
