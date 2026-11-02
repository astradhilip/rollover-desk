export type Role = 'analyst' | 'viewer';

export interface User {
  id: string;
  email: string;
  role: Role;
  organizationId: string;
  organizationName: string;
}

/** What a verified token proves. Every use case takes the organization from here, never from a request. */
export interface Principal {
  userId: string;
  organizationId: string;
  role: Role;
}
