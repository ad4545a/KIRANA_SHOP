import { colors, spacing, borderRadius } from '../theme/tokens';
import { apiClient } from '../api/client';
import { productsApi } from '../api/products';
import { getPurchases, getPurchaseById, createPurchase, getStockLedger } from '../api/purchases';
import {
  getCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  updateCustomerStatus,
  getCustomerLedger,
} from '../api/customers';
import { createBill, getBills, getBillById } from '../api/billing';
import { v4 as uuidv4 } from 'uuid';

describe('Frontend Phase 3, 4, 5 & 6 — Products, Purchases, Customers & POS Billing Service Tests', () => {
  it('loads design system color tokens correctly', () => {
    expect(colors.primary).toBe('#1E40AF');
    expect(colors.secondary).toBe('#059669');
    expect(spacing.md).toBe(16);
    expect(borderRadius.md).toBe(12);
  });

  it('configures base REST API client with /api/v1 baseURL', () => {
    expect(apiClient).toBeDefined();
    expect(apiClient.defaults.baseURL).toContain('/api/v1');
  });

  it('provides productsApi service methods matching backend REST endpoints', () => {
    expect(productsApi.getProducts).toBeDefined();
    expect(productsApi.getProductById).toBeDefined();
    expect(productsApi.createProduct).toBeDefined();
    expect(productsApi.updateProduct).toBeDefined();
    expect(productsApi.updateProductStatus).toBeDefined();
  });

  it('provides purchase service methods for OWNER stock-in workflows', () => {
    expect(getPurchases).toBeDefined();
    expect(getPurchaseById).toBeDefined();
    expect(createPurchase).toBeDefined();
    expect(getStockLedger).toBeDefined();
  });

  it('generates valid UUID v4 idempotency keys for purchase and billing submissions', () => {
    const key1 = uuidv4();
    const key2 = uuidv4();

    expect(key1).toBeDefined();
    expect(key2).toBeDefined();
    expect(key1).not.toEqual(key2);
    // UUID v4 format regex validation
    expect(key1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it('provides customer management & ledger service methods matching backend contracts', () => {
    expect(getCustomers).toBeDefined();
    expect(getCustomerById).toBeDefined();
    expect(createCustomer).toBeDefined();
    expect(updateCustomer).toBeDefined();
    expect(updateCustomerStatus).toBeDefined();
    expect(getCustomerLedger).toBeDefined();
  });

  it('provides billing service methods for POS checkout and bill history', () => {
    expect(createBill).toBeDefined();
    expect(getBills).toBeDefined();
    expect(getBillById).toBeDefined();
  });

  it('provides payment, analytics, ledger adjustment, audit log, returns & notification service methods matching backend contracts', () => {
    const { createPayment, getPayments, getPaymentById } = require('../api/payments');
    const { getDashboardAnalytics } = require('../api/analytics');
    const { postManualAdjustment, getCustomerLedger } = require('../api/customers');
    const { getAuditLogs } = require('../api/auditLogs');
    const { processReturn, getReturns, getReturnById } = require('../api/returns');
    const { getNotifications, updateNotificationStatus } = require('../api/notifications');

    expect(createPayment).toBeDefined();
    expect(getPayments).toBeDefined();
    expect(getPaymentById).toBeDefined();
    expect(getDashboardAnalytics).toBeDefined();
    expect(postManualAdjustment).toBeDefined();
    expect(getCustomerLedger).toBeDefined();
    expect(getAuditLogs).toBeDefined();
    expect(processReturn).toBeDefined();
    expect(getReturns).toBeDefined();
    expect(getReturnById).toBeDefined();
    expect(getNotifications).toBeDefined();
    expect(updateNotificationStatus).toBeDefined();
  });
});
