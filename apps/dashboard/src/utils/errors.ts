/** A message safe to show in the UI for anything thrown by a mutation. */
export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : 'Something went wrong. Please try again.';
}
