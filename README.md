# Kirana Store Management & Billing System (Single-Shop Edition) — Backend

Production-quality Node.js + Express + TypeScript backend for a single-shop Kirana Store Management & POS Billing System.

---

## 1. Project Purpose & Architecture

This backend serves **one physical Kirana store**. It is designed to be simple, robust, secure, and easily maintainable without unnecessary infrastructure overhead.

### Architecture Topology
```
React Native Mobile App (Owner / Worker)
        │
        │ Firebase Auth (Login) + REST API (JSON)
        ▼
Node.js + Express + TypeScript Backend
        │
        │ Firebase Admin SDK
        ▼
Firebase Firestore (Single database, flat collections)
```

### Key Architectural Boundaries
- **Single-Shop Only**: There is **no `storeId`**, no multi-tenant isolation layer, and no tenant nesting.
- **Backend as Gatekeeper**: The React Native mobile app **never writes directly to Firestore**. All business mutations (bills, payments, stock, purchases) go through this Express API.
- **Firebase Custom Claims for Roles**: Authorization decisions (`OWNER` / `WORKER`) are governed **strictly** by verified Firebase Custom Claims on the user's Auth token, **never** client-supplied body parameters or Firestore documents directly.
- **No Unnecessary Infrastructure**: No Microservices, Docker, Kubernetes, Redis, Kafka, RabbitMQ, BullMQ, Cloud Functions, or GraphQL.

---

## 2. Technology Stack

- **Runtime**: Node.js (v18+) & Express
- **Language**: Strict TypeScript (`tsconfig.json`)
- **Database**: Firebase Firestore (via `firebase-admin`)
- **Authentication**: Firebase Authentication + Custom Claims
- **Validation**: Zod
- **Security**: Helmet, CORS, Express Rate Limit
- **Logging**: Pino & Pino HTTP (Structured JSON logging with header redaction)
- **Testing**: Jest, Supertest, ts-jest

---

## 3. Directory Structure

```
d:/andriod_app/kirana/
├── PRD.md                       # Business PRD Source of Truth (v3.1)
├── BRAIN.md                     # Project Memory & Engineering Changelog
├── firestore.rules              # Firestore Security Rules (Deny client writes)
├── .env.example                 # Environment variables template
├── .gitignore                   # Git ignore settings
├── tsconfig.json                # Strict TypeScript configuration
├── package.json                 # Project manifest & scripts
├── jest.config.js               # Jest configuration
└── src/
    ├── app.ts                   # Express application configuration
    ├── server.ts                # HTTP server startup & graceful shutdown
    ├── config/
    │   ├── env.ts               # Typed env loader (fail-fast on startup)
    │   ├── firebase.ts          # Singleton Firebase Admin SDK init
    │   └── logger.ts            # Pino logger configuration
    ├── middlewares/
    │   ├── authenticate.ts      # Firebase ID Token verification & claims extraction
    │   ├── authorize.ts         # Custom Claims RBAC middleware
    │   ├── validate.ts          # Zod schema validation middleware
    │   ├── errorHandler.ts      # Centralized AppError global handler
    │   ├── notFound.ts          # 404 Route Not Found handler
    │   └── requestId.ts         # X-Request-Id middleware
    ├── routes/
    │   ├── index.ts             # Route registration & API versioning (/api/v1)
    │   └── health.routes.ts     # GET /health and GET /ready endpoints
    ├── modules/
    │   ├── auth/                # Auth controller, routes, service, types
    │   └── users/               # User profile types & constants
    ├── shared/
    │   ├── constants/           # HTTP status codes & Role constants
    │   ├── errors/              # AppError custom operational error class
    │   ├── types/               # Express Request ambient type extensions
    │   └── utils/               # Async handler wrapper
    ├── infrastructure/
    │   └── firestore/           # Centralized collection constants
    └── tests/
        ├── health.test.ts       # Health & Auth foundation unit tests
        └── rbac_validation.test.ts # RBAC & Zod validation middleware tests
```

---

## 4. Environment Variables

Create a `.env` file in the root directory:

```env
NODE_ENV=development
PORT=5000

# Required Firebase Credentials
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=your-service-account-email@project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_HERE\n-----END PRIVATE KEY-----\n"

# Optional Configurations
CORS_ORIGIN=http://localhost:3000
LOG_LEVEL=info
```

The application uses fail-fast validation (`src/config/env.ts`) and will immediately terminate startup if required environment variables are missing.

---

## 5. Development & Testing Commands

```bash
# Install dependencies
npm install

# Start development server with hot reload
npm run dev

# Run TypeScript compilation check
npm run build

# Run unit and integration tests
npm test

# Start production server
npm start
```

---

## 6. Authentication & RBAC Flow

1. **Client Authentication**: Mobile client signs in via Firebase Authentication and obtains a Firebase ID Token.
2. **Bearer Authorization Header**: Client sends header `Authorization: Bearer <ID_TOKEN>` on API requests.
3. **Verification**: `authenticate` middleware verifies token using `adminAuth.verifyIdToken()`.
4. **Context Attachment**: Middleware extracts `uid` and custom claims (`role: "OWNER" | "WORKER"`) and populates `req.user`.
5. **Authorization Enforcement**: `authorize("OWNER")` middleware checks `req.user.role`. If forbidden, returns `403 FORBIDDEN`.

---

## 7. Operational & Security Baseline

- **Body Size Limit**: Standard 100kb JSON body size limit.
- **Request IDs**: Every request is stamped with an `X-Request-Id` UUID (reused if valid incoming format provided).
- **Structured Error Responses**:
  ```json
  {
    "success": false,
    "error": {
      "code": "UNAUTHORIZED",
      "message": "Missing or invalid Authorization header"
    },
    "requestId": "550e8400-e29b-41d4-a716-446655440000"
  }
  ```
- **Firestore Client Access**: Restricted via `firestore.rules` (Client direct writes denied). Express Admin SDK bypasses client security rules.
