import { z } from 'zod';

export const returnItemInputSchema = z.object({
  productId: z.string().min(1, 'Product ID is required'),
  qty: z.number().positive('Return quantity must be greater than zero'),
});

export const processReturnSchema = z.object({
  originalBillId: z.string().min(1, 'Original bill ID is required'),
  items: z.array(returnItemInputSchema).min(1, 'At least one return item is required'),
  refundMethod: z.enum(['CASH', 'UPI', 'CREDIT'], {
    required_error: 'Refund method (CASH, UPI, or CREDIT) is required',
  }),
  reason: z.string().min(1, 'Return reason is required').max(500, 'Reason too long'),
  idempotencyKey: z.string().uuid('Idempotency key must be a valid UUID').optional(),
});

export type ReturnItemInputDto = z.infer<typeof returnItemInputSchema>;
export type ProcessReturnDto = z.infer<typeof processReturnSchema>;
