import { z } from 'zod';

const unitTypeSchema = z.enum(['BASE', 'COUNT']);
const baseUnitSchema = z.enum(['g', 'ml', 'pc']);
const displayUnitSchema = z.enum(['kg', 'L', 'packet', 'pc']);

export const createProductSchema = z
  .object({
    name: z.string().min(1, 'Product name is required'),
    category: z.string().min(1, 'Category is required'),
    sku: z.string().optional(),
    unitType: unitTypeSchema,
    baseUnit: baseUnitSchema,
    displayUnit: displayUnitSchema,
    unitConversionFactor: z.number().positive('Unit conversion factor must be positive'),
    purchasePrice: z.number().min(0, 'Purchase price cannot be negative'),
    sellingPrice: z.number().min(0, 'Selling price cannot be negative'),
    minimumStock: z.number().min(0, 'Minimum stock cannot be negative'),
    initialStock: z.number().min(0, 'Initial stock cannot be negative').optional(),
    gstPercent: z.number().min(0, 'GST percent cannot be negative').max(100, 'GST percent cannot exceed 100'),
    supplierId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.unitType === 'COUNT') {
        return data.baseUnit === 'pc';
      }
      return true;
    },
    {
      message: "COUNT unitType products must use 'pc' as baseUnit",
      path: ['baseUnit'],
    }
  )
  .refine(
    (data) => {
      if (data.baseUnit === 'g' && data.displayUnit !== 'kg' && data.displayUnit !== 'packet') {
        return false;
      }
      if (data.baseUnit === 'ml' && data.displayUnit !== 'L' && data.displayUnit !== 'packet') {
        return false;
      }
      if (data.baseUnit === 'pc' && data.displayUnit !== 'pc' && data.displayUnit !== 'packet') {
        return false;
      }
      return true;
    },
    {
      message: 'Incompatible displayUnit for the specified baseUnit',
      path: ['displayUnit'],
    }
  );

export const updateProductSchema = z
  .object({
    name: z.string().min(1, 'Product name cannot be empty').optional(),
    category: z.string().min(1, 'Category cannot be empty').optional(),
    sku: z.string().optional(),
    unitType: unitTypeSchema.optional(),
    baseUnit: baseUnitSchema.optional(),
    displayUnit: displayUnitSchema.optional(),
    unitConversionFactor: z.number().positive('Unit conversion factor must be positive').optional(),
    purchasePrice: z.number().min(0, 'Purchase price cannot be negative').optional(),
    sellingPrice: z.number().min(0, 'Selling price cannot be negative').optional(),
    minimumStock: z.number().min(0, 'Minimum stock cannot be negative').optional(),
    gstPercent: z.number().min(0, 'GST percent cannot be negative').max(100, 'GST percent cannot exceed 100').optional(),
    supplierId: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.unitType === 'COUNT' && data.baseUnit && data.baseUnit !== 'pc') {
        return false;
      }
      return true;
    },
    {
      message: "COUNT unitType products must use 'pc' as baseUnit",
      path: ['baseUnit'],
    }
  );

export const updateProductStatusSchema = z.object({
  isActive: z.boolean({
    required_error: 'isActive status is required',
  }),
});

export const productQuerySchema = z.object({
  category: z.string().optional(),
  search: z.string().optional(),
  isActive: z.string().optional(), // 'true' or 'false' string in query
});

export type CreateProductDto = z.infer<typeof createProductSchema>;
export type UpdateProductDto = z.infer<typeof updateProductSchema>;
export type UpdateProductStatusDto = z.infer<typeof updateProductStatusSchema>;
export type ProductQueryDto = z.infer<typeof productQuerySchema>;
