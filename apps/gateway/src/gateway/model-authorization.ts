/**
 * Model identifier normalization and authorization policies.
 *
 * Replaces unsafe substring matching with strict exact-match semantics
 * while supporting reviewed, explicit provider alias mappings.
 */

/**
 * Explicit, reviewed model alias mapping.
 * Normalizes vendor-specific or format-specific aliases to their canonical model identifiers
 * matching the database catalogue (e.g. Google AI SDK `models/` prefix).
 */
export const MODEL_ALIASES: Readonly<Record<string, string>> = Object.freeze({
  'models/gemini-2.0-flash': 'gemini-2.0-flash',
  'models/gemini-2.0-flash-lite': 'gemini-2.0-flash-lite',
  'models/gemini-2.5-flash': 'gemini-2.5-flash',
  'models/gemini-2.5-pro': 'gemini-2.5-pro',
  'models/gemini-1.5-flash': 'gemini-1.5-flash',
  'models/gemini-1.5-pro': 'gemini-1.5-pro',
});

/**
 * Normalizes a model identifier for exact matching:
 * - Trims leading and trailing whitespace
 * - Converts to lowercase
 * - Resolves known, reviewed aliases from MODEL_ALIASES
 *
 * Normalization never broadens model scopes or allows partial matching.
 */
export function normalizeModelIdentifier(model: string): string {
  if (!model || typeof model !== 'string') {
    return '';
  }
  const trimmed = model.trim().toLowerCase();
  return MODEL_ALIASES[trimmed] ?? trimmed;
}

/**
 * Determines whether a requested model is permitted according to the allowedModels policy.
 *
 * Semantic behavior:
 * - `allowedModels === null`, `undefined`, or empty `[]` signifies an unrestricted policy
 *   where the team/project has placed no model-level restriction.
 * - When `allowedModels` contains one or more entries, strict exact matching against the
 *   canonical model identifiers is enforced.
 * - Substring matching, prefix matching, and cross-variant confusion
 *   (e.g., gpt-4o vs gpt-4o-mini, gemini-2.0-flash vs gemini-2.0-flash-lite) are strictly rejected.
 */
export function isModelPermitted(requestedModel: string, allowedModels?: string[] | null): boolean {
  if (!allowedModels || allowedModels.length === 0) {
    return true;
  }

  const canonicalRequested = normalizeModelIdentifier(requestedModel);
  if (!canonicalRequested) {
    return false;
  }

  return allowedModels.some((allowed) => normalizeModelIdentifier(allowed) === canonicalRequested);
}
