export type UnitType = 'BASE' | 'COUNT';
export type BaseUnit = 'g' | 'ml' | 'pc';
export type DisplayUnit = 'kg' | 'L' | 'packet' | 'pc';

export interface Product {
  productId: string;
  name: string;
  category: string;
  sku?: string;
  unitType: UnitType;
  baseUnit: BaseUnit;
  displayUnit: DisplayUnit;
  unitConversionFactor: number;
  purchasePrice: number;
  sellingPrice: number;
  currentStock: number; // in baseUnit
  minimumStock: number; // in baseUnit
  gstPercent: number;
  supplierId?: string;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
}
