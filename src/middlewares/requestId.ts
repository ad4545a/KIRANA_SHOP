import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4, validate as validateUuid } from 'uuid';

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incomingRequestId = req.header('X-Request-Id');
  
  let reqId: string;
  if (incomingRequestId && validateUuid(incomingRequestId)) {
    reqId = incomingRequestId;
  } else {
    reqId = uuidv4();
  }

  req.id = reqId;
  res.setHeader('X-Request-Id', reqId);
  next();
};
