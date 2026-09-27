import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.LOG_LEVEL,
  base: {
    env: env.NODE_ENV,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers["authorization"]',
      'password',
      'token',
      'privateKey',
      'FIREBASE_PRIVATE_KEY',
      'upiReference',
      'paymentSecret'
    ],
    remove: true,
  },
});
