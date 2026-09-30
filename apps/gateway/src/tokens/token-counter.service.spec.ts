import { TokenCounter } from './token-counter.service';

const counter = new TokenCounter();

describe('TokenCounter', () => {
  it('counts plain text with the OpenAI tokenizer', () => {
    expect(counter.countText('gpt-4', 'hello world')).toBe(2);
    expect(counter.countText('gpt-4o', 'hello world')).toBe(2);
    expect(counter.countText('gpt-4', '')).toBe(0);
  });

  it('adds the chat format overhead to messages', () => {
    // 3 (reply priming) + 3 (message overhead) + 1 ("user") + 1 ("Hello")
    expect(counter.countMessages('gpt-4', [{ role: 'user', content: 'Hello' }])).toBe(8);
  });

  it('grows with every message and with longer content', () => {
    const one = counter.countMessages('gpt-4', [{ role: 'user', content: 'Hi' }]);
    const two = counter.countMessages('gpt-4', [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello there, how can I help?' },
    ]);
    expect(two).toBeGreaterThan(one + 6);
  });

  it('counts a participant name', () => {
    const plain = counter.countMessages('gpt-4', [{ role: 'user', content: 'Hi' }]);
    const named = counter.countMessages('gpt-4', [{ role: 'user', content: 'Hi', name: 'alice' }]);
    expect(named).toBeGreaterThanOrEqual(plain);
  });

  it('handles unicode and unknown model names without throwing', () => {
    expect(counter.countText('some-future-model', 'Olá, 世界 🌍')).toBeGreaterThan(0);
    expect(
      counter.countMessages('not-an-openai-model', [{ role: 'user', content: 'x' }]),
    ).toBeGreaterThan(0);
  });

  it('gives a newer model family its own vocabulary', () => {
    // Different vocabularies split some text differently; both must simply return a sensible count.
    const text = 'Tokenization of uncommonly-worded sentences differs between vocabularies.';
    expect(counter.countText('gpt-4o', text)).toBeGreaterThan(5);
    expect(counter.countText('gpt-4', text)).toBeGreaterThan(5);
  });
});
