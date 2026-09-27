export const ROLES = {
  OWNER: 'OWNER',
  WORKER: 'WORKER',
} as const;

export type UserRole = (typeof ROLES)[keyof typeof ROLES];
