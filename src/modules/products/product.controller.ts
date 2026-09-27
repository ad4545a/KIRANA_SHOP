import { Request, Response } from 'express';
import { productService } from './product.service';
import { HTTP_STATUS } from '../../shared/constants/httpStatus';
import { CreateProductDto, ProductQueryDto, UpdateProductDto, UpdateProductStatusDto } from './product.dto';

export class ProductController {
  public async createProduct(req: Request, res: Response): Promise<void> {
    const dto: CreateProductDto = req.body;
    const product = await productService.createProduct(dto);
    res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: { product },
    });
  }

  public async getProduct(req: Request, res: Response): Promise<void> {
    const { productId } = req.params;
    const product = await productService.getProductById(productId as string);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { product },
    });
  }

  public async listProducts(req: Request, res: Response): Promise<void> {
    const query: ProductQueryDto = req.query as any;
    const products = await productService.listProducts(query);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { products },
    });
  }

  public async updateProduct(req: Request, res: Response): Promise<void> {
    const { productId } = req.params;
    const dto: UpdateProductDto = req.body;
    const product = await productService.updateProduct(productId as string, dto);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { product },
    });
  }

  public async updateProductStatus(req: Request, res: Response): Promise<void> {
    const { productId } = req.params;
    const dto: UpdateProductStatusDto = req.body;
    const product = await productService.updateProductStatus(productId as string, dto);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      data: { product },
    });
  }

  public async deleteProduct(req: Request, res: Response): Promise<void> {
    const { productId } = req.params;
    await productService.deleteProduct(productId as string);
    res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Product deleted successfully',
    });
  }
}

export const productController = new ProductController();
