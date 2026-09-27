import { z } from 'zod';

export const manualAllocationItemSchema = z.object({
  billId: z.string().min(1, 'billId is required'),
  amount: z.number().positive('allocated amount must be greater than zero'),
});

export const createPaymentSchema = z
  .object({
    idempotencyKey: z.string().uuid('idempotencyKey must be a valid UUID').optional(),
    customerId: z.string().min(1, 'customerId is required'),
    amount: z.number().positive('payment amount must be greater than zero'),
    method: z.enum(['CASH', 'UPI', 'OTHER'], {
      errorMap: () => ({ message: "method must be 'CASH', 'UPI', or 'OTHER'" }),
    }),
    upiReference: z.string().optional(),
    manualAllocation: z.array(manualAllocationItemSchema).optional(),
  })
  .refine(
    (data) => {
      if (data.method === 'UPI' && data.upiReference && data.upiReference.trim() === '') {
        return false;
      }
      return true;
    },
    {
      message: 'upiReference cannot be empty if provided',
      path: ['upiReference'],
    }
  );

export type CreatePaymentDto = z.infer<typeof createPaymentSchema>;
