import { fromGeminiResponse, readGeminiError, toGeminiRequest } from './gemini.mapper';
import { ProviderError } from './provider.interface';
import type { ChatCompletionRequest } from './provider.interface';

const request = (overrides: Partial<ChatCompletionRequest> = {}): ChatCompletionRequest => ({
  model: 'gemini-2.0-flash',
  messages: [{ role: 'user', content: 'Hello' }],
  ...overrides,
});

describe('toGeminiRequest', () => {
  it('maps user and assistant messages, calling the assistant "model"', () => {
    const body = toGeminiRequest(
      request({
        messages: [
          { role: 'user', content: 'Hi' },
          { role: 'assistant', content: 'Hello!' },
          { role: 'user', content: 'How are you?' },
        ],
      }),
    );
    expect(body.contents).toEqual([
      { role: 'user', parts: [{ text: 'Hi' }] },
      { role: 'model', parts: [{ text: 'Hello!' }] },
      { role: 'user', parts: [{ text: 'How are you?' }] },
    ]);
    expect(body.systemInstruction).toBeUndefined();
  });

  it('moves system messages into systemInstruction, joined in order', () => {
    const body = toGeminiRequest(
      request({
        messages: [
          { role: 'system', content: 'Be brief.' },
          { role: 'user', content: 'Hi' },
          { role: 'system', content: 'Answer in French.' },
        ],
      }),
    );
    expect(body.systemInstruction).toEqual({ parts: [{ text: 'Be brief.\n\nAnswer in French.' }] });
    expect(body.contents).toHaveLength(1);
  });

  it('maps every generation parameter and omits the ones not given', () => {
    expect(
      toGeminiRequest(
        request({
          temperature: 0.3,
          topP: 0.8,
          maxTokens: 200,
          stop: ['END'],
          presencePenalty: 0.1,
          frequencyPenalty: -0.2,
        }),
      ).generationConfig,
    ).toEqual({
      temperature: 0.3,
      topP: 0.8,
      maxOutputTokens: 200,
      stopSequences: ['END'],
      presencePenalty: 0.1,
      frequencyPenalty: -0.2,
    });
    expect(toGeminiRequest(request()).generationConfig).toEqual({});
  });

  it('keeps a temperature of zero', () => {
    expect(toGeminiRequest(request({ temperature: 0 })).generationConfig).toEqual({
      temperature: 0,
    });
  });

  it('does not send the end-user identifier or participant names, which Gemini has no field for', () => {
    const body = toGeminiRequest(
      request({ user: 'u-1', messages: [{ role: 'user', content: 'Hi', name: 'alice' }] }),
    );
    expect(JSON.stringify(body)).not.toMatch(/u-1|alice/);
  });

  it('rejects a conversation that has only system messages', () => {
    const attempt = () =>
      toGeminiRequest(request({ messages: [{ role: 'system', content: 'Only instructions' }] }));
    expect(attempt).toThrow(ProviderError);
    expect(attempt).toThrow(/at least one user or assistant message/i);
  });
});

describe('fromGeminiResponse', () => {
  const ok = {
    candidates: [
      { content: { role: 'model', parts: [{ text: 'Hi there' }] }, finishReason: 'STOP' },
    ],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, totalTokenCount: 8 },
    modelVersion: 'gemini-2.0-flash-001',
    responseId: 'abc123',
  };
  const NOW = 1_790_000_000_000;

  it('normalises a normal reply', () => {
    expect(fromGeminiResponse(ok, request(), () => NOW)).toEqual({
      id: 'gemini-abc123',
      created: 1_790_000_000,
      model: 'gemini-2.0-flash-001',
      choices: [
        { index: 0, message: { role: 'assistant', content: 'Hi there' }, finishReason: 'stop' },
      ],
      usage: { promptTokens: 5, completionTokens: 3, totalTokens: 8 },
    });
  });

  it('joins several text parts and skips reasoning ("thought") parts', () => {
    const result = fromGeminiResponse(
      {
        candidates: [
          {
            content: {
              parts: [
                { text: 'secret reasoning', thought: true },
                { text: 'Hello ' },
                { text: 'world' },
              ],
            },
            finishReason: 'STOP',
          },
        ],
      },
      request(),
    );
    expect(result.choices[0]?.message.content).toBe('Hello world');
  });

  it('counts reasoning tokens as output, since they are generated and billed', () => {
    const result = fromGeminiResponse(
      {
        ...ok,
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3, thoughtsTokenCount: 40 },
      },
      request(),
    );
    expect(result.usage).toEqual({ promptTokens: 5, completionTokens: 43, totalTokens: 48 });
  });

  it('leaves usage out when Gemini reported none', () => {
    const withoutUsage = { candidates: ok.candidates, modelVersion: ok.modelVersion };
    expect(fromGeminiResponse(withoutUsage, request()).usage).toBeUndefined();
  });

  it.each([
    ['STOP', 'stop'],
    ['MAX_TOKENS', 'length'],
    ['SAFETY', 'content_filter'],
    ['RECITATION', 'content_filter'],
    ['PROHIBITED_CONTENT', 'content_filter'],
    ['SOMETHING_NEW', 'something_new'],
  ])('maps the finish reason %s to %s', (gemini, expected) => {
    const result = fromGeminiResponse(
      { candidates: [{ content: { parts: [{ text: 'x' }] }, finishReason: gemini }] },
      request(),
    );
    expect(result.choices[0]?.finishReason).toBe(expected);
  });

  it('returns null content when the answer was cut off by a safety filter', () => {
    const result = fromGeminiResponse({ candidates: [{ finishReason: 'SAFETY' }] }, request());
    expect(result.choices[0]).toMatchObject({
      message: { content: null },
      finishReason: 'content_filter',
    });
  });

  it('treats a blocked prompt as the caller own input being refused', () => {
    expect(() =>
      fromGeminiResponse({ promptFeedback: { blockReason: 'SAFETY' } }, request()),
    ).toThrow(
      expect.objectContaining({ kind: 'bad_request', message: expect.stringContaining('SAFETY') }),
    );
  });

  it.each([{}, null, 'text', { candidates: [] }])(
    'treats %j as no answer from the provider',
    (data) => {
      expect(() => fromGeminiResponse(data, request())).toThrow(
        expect.objectContaining({ kind: 'unavailable' }),
      );
    },
  );

  it('falls back to the requested model name and a generated id', () => {
    const result = fromGeminiResponse(
      { candidates: [{ content: { parts: [{ text: 'x' }] } }] },
      request({ model: 'gemini-2.5-pro' }),
    );
    expect(result.model).toBe('gemini-2.5-pro');
    expect(result.id).toMatch(/^gemini-[0-9a-f-]{36}$/);
  });
});

describe('readGeminiError', () => {
  it('reads message, status and the machine reason', () => {
    expect(
      readGeminiError({
        error: {
          code: 400,
          message: 'API key not valid.',
          status: 'INVALID_ARGUMENT',
          details: [{ '@type': 'x', reason: 'API_KEY_INVALID' }],
        },
      }),
    ).toEqual({
      message: 'API key not valid.',
      status: 'INVALID_ARGUMENT',
      reason: 'API_KEY_INVALID',
    });
  });

  it('copes with bodies that are not Gemini errors', () => {
    expect(readGeminiError(null)).toEqual({});
    expect(readGeminiError({ error: 'plain string' })).toEqual({});
    expect(readGeminiError('<html>')).toEqual({});
  });
});
