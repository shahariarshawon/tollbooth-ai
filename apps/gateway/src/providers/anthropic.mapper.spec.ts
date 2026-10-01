import {
  DEFAULT_MAX_TOKENS,
  fromAnthropicResponse,
  readAnthropicError,
  toAnthropicRequest,
} from './anthropic.mapper';
import type { ChatCompletionRequest } from './provider.interface';

const request = (overrides: Partial<ChatCompletionRequest> = {}): ChatCompletionRequest => ({
  model: 'claude-sonnet-4-5',
  messages: [{ role: 'user', content: 'Hello' }],
  ...overrides,
});

describe('toAnthropicRequest', () => {
  it('maps messages and moves system messages into the system field', () => {
    const body = toAnthropicRequest(
      request({
        messages: [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello' },
          { role: 'user', content: 'Again' },
        ],
      }),
    );
    expect(body.system).toBe('Be brief.');
    expect(body.messages).toEqual([
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello' },
      { role: 'user', content: 'Again' },
    ]);
  });

  it('always sends max_tokens, because Anthropic requires it', () => {
    expect(toAnthropicRequest(request()).max_tokens).toBe(DEFAULT_MAX_TOKENS);
    expect(toAnthropicRequest(request({ maxTokens: 300 })).max_tokens).toBe(300);
  });

  it('caps temperature at 1, the top of Anthropic range', () => {
    expect(toAnthropicRequest(request({ temperature: 1.8 })).temperature).toBe(1);
    expect(toAnthropicRequest(request({ temperature: 0.4 })).temperature).toBe(0.4);
    expect(toAnthropicRequest(request({ temperature: 0 })).temperature).toBe(0);
  });

  it('sends top_p only when there is no temperature, since newer models refuse both', () => {
    expect(toAnthropicRequest(request({ topP: 0.9 })).top_p).toBe(0.9);
    const both = toAnthropicRequest(request({ temperature: 0.5, topP: 0.9 }));
    expect(both.temperature).toBe(0.5);
    expect(both).not.toHaveProperty('top_p');
  });

  it('maps stop sequences and leaves out parameters Anthropic does not have', () => {
    const body = toAnthropicRequest(
      request({ stop: ['END'], presencePenalty: 1, frequencyPenalty: 1, user: 'u-1' }),
    );
    expect(body.stop_sequences).toEqual(['END']);
    expect(JSON.stringify(body)).not.toMatch(/penalty|u-1/);
  });

  it('rejects a conversation with only system messages', () => {
    expect(() =>
      toAnthropicRequest(request({ messages: [{ role: 'system', content: 'x' }] })),
    ).toThrow(expect.objectContaining({ kind: 'bad_request' }));
  });
});

describe('fromAnthropicResponse', () => {
  const ok = {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-4-5-20250929',
    content: [
      { type: 'text', text: 'Hi' },
      { type: 'text', text: ' there' },
    ],
    stop_reason: 'end_turn',
    usage: { input_tokens: 9, output_tokens: 4 },
  };

  it('normalises a reply', () => {
    expect(fromAnthropicResponse(ok, request(), () => 1_790_000_000_000)).toEqual({
      id: 'msg_1',
      created: 1_790_000_000,
      model: 'claude-sonnet-4-5-20250929',
      choices: [
        { index: 0, message: { role: 'assistant', content: 'Hi there' }, finishReason: 'stop' },
      ],
      usage: { promptTokens: 9, completionTokens: 4, totalTokens: 13 },
    });
  });

  it.each([
    ['end_turn', 'stop'],
    ['stop_sequence', 'stop'],
    ['max_tokens', 'length'],
    ['refusal', 'content_filter'],
    ['tool_use', 'tool_use'],
  ])('maps stop reason %s to %s', (reason, expected) => {
    expect(
      fromAnthropicResponse({ ...ok, stop_reason: reason }, request()).choices[0]?.finishReason,
    ).toBe(expected);
  });

  it('ignores non-text content blocks', () => {
    const result = fromAnthropicResponse(
      {
        ...ok,
        content: [
          { type: 'thinking', thinking: 'hidden' },
          { type: 'text', text: 'Answer' },
        ],
      },
      request(),
    );
    expect(result.choices[0]?.message.content).toBe('Answer');
  });

  it('leaves usage out when absent', () => {
    const withoutUsage = { ...ok, usage: undefined };
    expect(fromAnthropicResponse(withoutUsage, request()).usage).toBeUndefined();
  });

  it.each([{}, null, 'text'])('treats %j as no answer', (data) => {
    expect(() => fromAnthropicResponse(data, request())).toThrow(
      expect.objectContaining({ kind: 'unavailable' }),
    );
  });
});

describe('readAnthropicError', () => {
  it('reads the message and type', () => {
    expect(
      readAnthropicError({
        type: 'error',
        error: { type: 'rate_limit_error', message: 'Slow down' },
      }),
    ).toEqual({ message: 'Slow down', type: 'rate_limit_error' });
    expect(readAnthropicError(null)).toEqual({});
  });
});
