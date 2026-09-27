import { HTTP_STATUS, HttpStatus } from '../constants/httpStatus';

export class AppError extends Error {
  public readonly statusCode: HttpStatus;
  public readonly code: string;
  public readonly details?: Record<string, any> | Array<any>;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: HttpStatus = HTTP_STATUS.INTERNAL_SERVER_ERROR,
    code: string = 'INTERNAL_SERVER_ERROR',
    details?: Record<string, any> | Array<any>,
    isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}
