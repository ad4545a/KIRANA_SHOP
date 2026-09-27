/**
 * Single-Shop Firestore Collection Names
 * Note: No storeId scoping or tenant nesting.
 */
export const COLLECTIONS = {
  PRODUCTS: 'products',
  CUSTOMERS: 'customers',
  PAYMENTS: 'payments',
  BILLS: 'bills',
  RETURNS: 'returns',
  NOTIFICATIONS: 'notifications',
  AUDIT_LOGS: 'auditLogs',
  USERS: 'users',
  COUNTERS: 'counters',
  DAILY_SUMMARY: 'dailySummary',
  PURCHASES: 'purchases',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];
