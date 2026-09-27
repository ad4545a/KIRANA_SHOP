import { z } from 'zod';

export const createWorkerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(10, 'Phone number must be at least 10 digits'),
  maxDiscountAmount: z.number().min(0, 'Discount amount cannot be negative').optional(),
  maxDiscountPercent: z.number().min(0, 'Discount percent cannot be negative').max(100, 'Discount percent cannot exceed 100').optional(),
});

export const updateWorkerStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'INACTIVE'], {
    errorMap: () => ({ message: "Status must be either 'ACTIVE' or 'INACTIVE'" }),
  }),
});

export const updateWorkerDiscountLimitSchema = z.object({
  maxDiscountAmount: z.number().min(0, 'Discount amount cannot be negative'),
  maxDiscountPercent: z.number().min(0, 'Discount percent cannot be negative').max(100, 'Discount percent cannot exceed 100'),
});

export type CreateWorkerDto = z.infer<typeof createWorkerSchema>;
export type UpdateWorkerStatusDto = z.infer<typeof updateWorkerStatusSchema>;
export type UpdateWorkerDiscountLimitDto = z.infer<typeof updateWorkerDiscountLimitSchema>;
