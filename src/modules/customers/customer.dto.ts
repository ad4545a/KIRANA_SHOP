import { z } from 'zod';

export const createCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name is required'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
});

export const updateCustomerSchema = z.object({
  name: z.string().min(1, 'Customer name cannot be empty').optional(),
  phone: z.string().min(10, 'Phone number must be at least 10 digits').optional(),
});

export const updateCustomerStatusSchema = z.object({
  isActive: z.boolean({
    required_error: 'isActive status is required',
  }),
});

export const customerQuerySchema = z.object({
  search: z.string().optional(),
  isActive: z.string().optional(),
});

export const manualAdjustmentSchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),
  amount: z
    .number({ required_error: 'Adjustment amount is required' })
    .refine((val) => val !== 0, { message: 'Adjustment amount cannot be zero' }),
  direction: z.enum(['DEBIT', 'CREDIT'], {
    required_error: 'Direction (DEBIT or CREDIT) is required',
  }),
  reason: z.string().min(1, 'Adjustment reason is required').max(500, 'Reason too long'),
});

export type CreateCustomerDto = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerDto = z.infer<typeof updateCustomerSchema>;
export type UpdateCustomerStatusDto = z.infer<typeof updateCustomerStatusSchema>;
export type CustomerQueryDto = z.infer<typeof customerQuerySchema>;
export type ManualAdjustmentDto = z.infer<typeof manualAdjustmentSchema>;
