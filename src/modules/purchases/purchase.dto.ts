import { z } from 'zod';

export const purchaseItemSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  quantity: z.number().positive('quantity must be greater than zero'),
  purchasePrice: z.number().min(0, 'purchasePrice cannot be negative').optional(),
});

export const createPurchaseSchema = z.object({
  idempotencyKey: z.string().uuid('idempotencyKey must be a valid UUID').optional(),
  supplierId: z.string().optional(),
  invoiceRef: z.string().optional(),
  items: z.array(purchaseItemSchema).min(1, 'Purchase must contain at least one item'),
});

export type CreatePurchaseDto = z.infer<typeof createPurchaseSchema>;
