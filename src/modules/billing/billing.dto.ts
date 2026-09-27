import { z } from 'zod';

export const paymentBreakdownSchema = z.object({
  cash: z.number().min(0, 'cash amount cannot be negative').default(0),
  upi: z.number().min(0, 'upi amount cannot be negative').default(0),
  other: z.number().min(0, 'other amount cannot be negative').default(0),
  credit: z.number().min(0, 'credit amount cannot be negative').default(0),
});

export const billItemInputSchema = z.object({
  productId: z.string().min(1, 'productId is required'),
  qty: z
    .number()
    .positive('qty must be greater than zero')
    .refine(
      (val) => {
        const str = val.toString();
        const decimals = str.includes('.') ? str.split('.')[1] : '';
        return decimals.length <= 3;
      },
      { message: 'qty cannot have more than 3 decimal places' }
    ),
});

export const createBillSchema = z
  .object({
    idempotencyKey: z.string().uuid('idempotencyKey must be a valid UUID').optional(),
    customerId: z.string().nullable().optional(),
    items: z.array(billItemInputSchema).min(1, 'Bill must contain at least one item'),
    discount: z.number().min(0, 'discount cannot be negative').default(0),
    paymentBreakdown: paymentBreakdownSchema,
  })
  .refine(
    (data) => {
      // If credit portion > 0, customerId must be provided
      if (data.paymentBreakdown.credit > 0 && !data.customerId) {
        return false;
      }
      return true;
    },
    {
      message: 'customerId is required when bill contains credit (Udhaar) payment portion',
      path: ['customerId'],
    }
  );

export type CreateBillDto = z.infer<typeof createBillSchema>;
