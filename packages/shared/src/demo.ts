/**
 * Identity of the public demo workspace. The seed creates it and the control plane's demo-session
 * endpoint looks it up, so both name it from here.
 */
export const DEMO_TENANT_SLUG = 'demo-workspace';

/** `.invalid` is reserved (RFC 2606): this address can never receive mail or belong to a real person. */
export const DEMO_USER_EMAIL = 'demo@tollbooth.invalid';

/**
 * Stored as the demo user's password hash. It is not a bcrypt hash, so no password ever matches it:
 * the demo account can only be entered through the demo-session endpoint, never by logging in.
 */
export const UNUSABLE_PASSWORD_HASH = '!';
