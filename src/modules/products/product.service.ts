import { firestore } from '../../config/firebase';
import { COLLECTIONS } from '../../infrastructure/firestore/collections';
import { AppError } from '../../shared/errors/AppError';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { Product } from './product.types';
import { CreateProductDto, ProductQueryDto, UpdateProductDto, UpdateProductStatusDto } from './product.dto';

export class ProductService {
  /**
   * Helper to check SKU uniqueness among ACTIVE products.
   */
  private async checkSkuUniqueness(sku?: string, excludeProductId?: string): Promise<void> {
    if (!sku || sku.trim() === '') return;

    const snapshot = await firestore
      .collection(COLLECTIONS.PRODUCTS)
      .where('sku', '==', sku.trim())
      .where('isActive', '==', true)
      .get();

    const conflictingDoc = snapshot.docs.find((doc) => doc.id !== excludeProductId);
    if (conflictingDoc) {
      throw new AppError(
        `Product with SKU '${sku}' already exists`,
        HTTP_STATUS.CONFLICT,
        'PRODUCT_SKU_EXISTS'
      );
    }
  }

  /**
   * Create a new product (OWNER only).
   */
  public async createProduct(dto: CreateProductDto): Promise<Product> {
    if (dto.sku) {
      await this.checkSkuUniqueness(dto.sku);
    }

    const docRef = firestore.collection(COLLECTIONS.PRODUCTS).doc();
    const now = new Date().toISOString();

    const newProductData: Omit<Product, 'productId'> = {
      name: dto.name.trim(),
      category: dto.category.trim(),
      sku: dto.sku ? dto.sku.trim() : undefined,
      unitType: dto.unitType,
      baseUnit: dto.baseUnit,
      displayUnit: dto.displayUnit,
      unitConversionFactor: dto.unitConversionFactor,
      purchasePrice: dto.purchasePrice,
      sellingPrice: dto.sellingPrice,
      currentStock: dto.initialStock ?? 0,
      minimumStock: dto.minimumStock,
      gstPercent: dto.gstPercent,
      supplierId: dto.supplierId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await docRef.set(newProductData);

    return {
      productId: docRef.id,
      ...newProductData,
    };
  }

  /**
   * Get single product by ID (OWNER + WORKER).
   */
  public async getProductById(productId: string): Promise<Product> {
    const docSnap = await firestore.collection(COLLECTIONS.PRODUCTS).doc(productId).get();

    if (!docSnap.exists) {
      throw new AppError('Product not found', HTTP_STATUS.NOT_FOUND, 'PRODUCT_NOT_FOUND');
    }

    const data = docSnap.data()!;
    return {
      productId: docSnap.id,
      name: data.name,
      category: data.category,
      sku: data.sku,
      unitType: data.unitType,
      baseUnit: data.baseUnit,
      displayUnit: data.displayUnit,
      unitConversionFactor: data.unitConversionFactor,
      purchasePrice: data.purchasePrice,
      sellingPrice: data.sellingPrice,
      currentStock: data.currentStock,
      minimumStock: data.minimumStock,
      gstPercent: data.gstPercent,
      supplierId: data.supplierId,
      isActive: data.isActive,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
    };
  }

  /**
   * List and filter products (OWNER + WORKER).
   */
  public async listProducts(query: ProductQueryDto): Promise<Product[]> {
    let collectionRef: FirebaseFirestore.Query = firestore.collection(COLLECTIONS.PRODUCTS);

    if (query.isActive !== undefined) {
      const activeBool = query.isActive === 'true';
      collectionRef = collectionRef.where('isActive', '==', activeBool);
    }

    if (query.category) {
      collectionRef = collectionRef.where('category', '==', query.category.trim());
    }

    const snapshot = await collectionRef.get();
    let products = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        productId: doc.id,
        name: data.name || '',
        category: data.category || '',
        sku: data.sku,
        unitType: data.unitType,
        baseUnit: data.baseUnit,
        displayUnit: data.displayUnit,
        unitConversionFactor: data.unitConversionFactor,
        purchasePrice: data.purchasePrice,
        sellingPrice: data.sellingPrice,
        currentStock: data.currentStock,
        minimumStock: data.minimumStock,
        gstPercent: data.gstPercent,
        supplierId: data.supplierId,
        isActive: data.isActive,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
      } as Product;
    });

    // In-memory search by name or SKU if search parameter provided
    if (query.search && query.search.trim() !== '') {
      const searchLower = query.search.trim().toLowerCase();
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          (p.sku && p.sku.toLowerCase().includes(searchLower)) ||
          p.category.toLowerCase().includes(searchLower)
      );
    }

    return products;
  }

  /**
   * Update product configuration (OWNER only).
   * Note: currentStock cannot be modified via updateProduct.
   */
  public async updateProduct(productId: string, dto: UpdateProductDto): Promise<Product> {
    const docRef = firestore.collection(COLLECTIONS.PRODUCTS).doc(productId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new AppError('Product not found', HTTP_STATUS.NOT_FOUND, 'PRODUCT_NOT_FOUND');
    }

    if (dto.sku) {
      await this.checkSkuUniqueness(dto.sku, productId);
    }

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = {
      updatedAt: now,
    };

    if (dto.name !== undefined) updatePayload.name = dto.name.trim();
    if (dto.category !== undefined) updatePayload.category = dto.category.trim();
    if (dto.sku !== undefined) updatePayload.sku = dto.sku.trim();
    if (dto.unitType !== undefined) updatePayload.unitType = dto.unitType;
    if (dto.baseUnit !== undefined) updatePayload.baseUnit = dto.baseUnit;
    if (dto.displayUnit !== undefined) updatePayload.displayUnit = dto.displayUnit;
    if (dto.unitConversionFactor !== undefined) updatePayload.unitConversionFactor = dto.unitConversionFactor;
    if (dto.purchasePrice !== undefined) updatePayload.purchasePrice = dto.purchasePrice;
    if (dto.sellingPrice !== undefined) updatePayload.sellingPrice = dto.sellingPrice;
    if (dto.minimumStock !== undefined) updatePayload.minimumStock = dto.minimumStock;
    if (dto.gstPercent !== undefined) updatePayload.gstPercent = dto.gstPercent;
    if (dto.supplierId !== undefined) updatePayload.supplierId = dto.supplierId;

    await docRef.update(updatePayload);

    return this.getProductById(productId);
  }

  /**
   * Soft delete / activate / deactivate product (OWNER only).
   */
  public async updateProductStatus(productId: string, dto: UpdateProductStatusDto): Promise<Product> {
    const docRef = firestore.collection(COLLECTIONS.PRODUCTS).doc(productId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new AppError('Product not found', HTTP_STATUS.NOT_FOUND, 'PRODUCT_NOT_FOUND');
    }

    const now = new Date().toISOString();
    await docRef.update({
      isActive: dto.isActive,
      updatedAt: now,
    });

    return this.getProductById(productId);
  }

  /**
   * Delete product document (OWNER only).
   */
  public async deleteProduct(productId: string): Promise<void> {
    const docRef = firestore.collection(COLLECTIONS.PRODUCTS).doc(productId);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      throw new AppError('Product not found', HTTP_STATUS.NOT_FOUND, 'PRODUCT_NOT_FOUND');
    }

    await docRef.delete();
  }
}

export const productService = new ProductService();
