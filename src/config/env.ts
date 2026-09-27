import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface EnvConfig {
  NODE_ENV: 'development' | 'production' | 'test';
  PORT: number;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  CORS_ORIGIN: string;
  LOG_LEVEL: string;
}

const getRequiredEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`[FATAL] Missing required environment variable: ${key}`);
  }
  return value;
};

const getEnvConfig = (): EnvConfig => {
  const nodeEnv = (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test';
  const port = parseInt(process.env.PORT || '5000', 10);

  // Skip strict missing env checks during unit test runs unless explicitly needed
  const isTest = nodeEnv === 'test';

  const firebaseProjectId = isTest ? (process.env.FIREBASE_PROJECT_ID || 'test-project-id') : getRequiredEnv('FIREBASE_PROJECT_ID');
  const firebaseClientEmail = isTest ? (process.env.FIREBASE_CLIENT_EMAIL || 'test@project.iam.gserviceaccount.com') : getRequiredEnv('FIREBASE_CLIENT_EMAIL');
  const rawPrivateKey = isTest ? (process.env.FIREBASE_PRIVATE_KEY || '-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQC...\n-----END PRIVATE KEY-----\n') : getRequiredEnv('FIREBASE_PRIVATE_KEY');
  const firebasePrivateKey = rawPrivateKey.replace(/^"(.*)"$/, '$1').replace(/\\n/g, '\n');

  return {
    NODE_ENV: nodeEnv,
    PORT: isNaN(port) ? 5000 : port,
    FIREBASE_PROJECT_ID: firebaseProjectId,
    FIREBASE_CLIENT_EMAIL: firebaseClientEmail,
    FIREBASE_PRIVATE_KEY: firebasePrivateKey,
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  };
};

export const env = getEnvConfig();
