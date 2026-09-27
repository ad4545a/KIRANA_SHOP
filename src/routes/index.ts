import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from '../modules/auth/auth.routes';
import userRoutes from '../modules/users/user.routes';
import productRoutes from '../modules/products/product.routes';
import purchaseRoutes from '../modules/purchases/purchase.routes';
import customerRoutes from '../modules/customers/customer.routes';
import billingRoutes from '../modules/billing/billing.routes';
import paymentRoutes from '../modules/payments/payment.routes';
import analyticsRoutes from '../modules/analytics/analytics.routes';
import ledgerRoutes from '../modules/customers/ledger.routes';
import auditLogRoutes from '../modules/auditLogs/auditLog.routes';
import returnRoutes from '../modules/returns/return.routes';
import notificationRoutes from '../modules/notifications/notification.routes';

const router = Router();

// Non-versioned health endpoints
router.use('/', healthRoutes);

// Version 1 API routes
router.use('/api/v1/health', healthRoutes);
router.use('/api/v1/auth', authRoutes);
router.use('/api/v1/users', userRoutes);
router.use('/api/v1/products', productRoutes);
router.use('/api/v1/purchases', purchaseRoutes);
router.use('/api/v1/customers', customerRoutes);
router.use('/api/v1/bills', billingRoutes);
router.use('/api/v1/payments', paymentRoutes);
router.use('/api/v1/analytics', analyticsRoutes);
router.use('/api/v1/ledger', ledgerRoutes);
router.use('/api/v1/audit-logs', auditLogRoutes);
router.use('/api/v1/returns', returnRoutes);
router.use('/api/v1/notifications', notificationRoutes);

export default router;
