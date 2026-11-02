export type Role = 'analyst' | 'viewer';

export interface User {
  id: string;
  email: string;
  role: Role;
  organizationId: string;
  organizationName: string;
}

/**
 * What a signed token claims. Role and organization aren't trusted from it: they are re-read from the user on
 * every request, and a token from an earlier session version is refused, so sign-out and role changes apply at once.
 */
export interface TokenClaims {
  userId: string;
  organizationId: string;
  sessionVersion: number;
}

/** What a verified token proves. Every use case takes the organization from here, never from a request. */
export interface Principal {
  userId: string;
  organizationId: string;
  role: Role;
}
