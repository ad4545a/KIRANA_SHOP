Product Requirements Document (PRD)
Kirana Store Management & Billing System (Single-Shop Edition)
Version: 3.1 (business-rule hardening — no new infrastructure) Tech Stack: React Native (Mobile), Node.js + Express (single backend service), Firebase (Auth, Firestore, Cloud Messaging), WhatsApp Business Cloud API (V1.5)

Changelog from v3.0: Architecture is unchanged — still one Express server, one Firestore database, no queues, no Cloud Functions. This version closes gaps in business rules and correctness: notification ordering, payment allocation, discount limits, concurrency-safe bill numbers, return-quantity guards, and role-source hardening. Nothing here adds new moving parts.

1. Executive Summary
A simple, role-based billing and stock-management app for one Kirana store. Two roles — Shop Owner and Shop Worker — share one backend. The system handles POS billing, automatic stock updates, a customer Udhaar (credit) ledger, payment settlement, an owner dashboard, and owner notifications. WhatsApp bill/reminder delivery is a fast-follow (V1.5).

There is exactly one shop, so there is no storeId, no tenant isolation, and no multi-store data model.

2. Problem Statement
(unchanged) Manual notebooks / disconnected tools mean no real-time owner visibility, no reliable Udhaar record, disconnected stock tracking, and no automated customer communication.

3. Architecture — Kept Deliberately Simple
One Express server. One Firestore database. No Cloud Functions, no job queue, no microservices.

React Native App (Owner + Worker, same codebase, UI branches by role)
        │
        │  REST calls (all writes) + Firebase Auth (login)
        ▼
Node.js + Express server  ── the only thing that writes to Firestore
        │
        ▼
Firebase Firestore  (single database, flat collections, no tenant scoping)
        │
        ├── Firebase Cloud Messaging → owner push notifications
        └── (V1.5) WhatsApp Business Cloud API → customer messages
Rules of thumb, unchanged from v3.0:

The mobile app never writes directly to Firestore. It calls the Express API for anything touching money or stock.
No Cloud Functions — a single always-on Express server is enough. Scheduled work (node-cron) runs inside the same process.
No job queue — "asynchronous" means fire-and-forget after responding, wrapped in try/catch, not a message broker.
Firestore Security Rules deny all client writes to business collections; Express (via Admin SDK) is the real gate.
Hosting: any small always-on box — ₹0–500/month VPS, Render/Railway hobby tier, or one Cloud Run service with min-instances=1.
New in this version: the mobile app no longer reads financial/dashboard numbers directly from Firestore. See §13.

4. User Roles & Permission Matrix
Feature	Shop Owner	Shop Worker
Login	✅	✅
Create bill	✅	✅ (subject to discount limit, §9)
View / search products	✅	✅
Add customer	✅	✅
Add Udhaar (credit sale)	✅	✅
Record a payment against Udhaar	✅	✅
View a customer's outstanding + recent bills	✅	✅ (limited)
View a customer's full ledger/history	✅	❌
Add / edit / delete products	✅	❌
Record stock purchase (stock-in)	✅	❌
Process a return	✅	❌ (can flag one; owner confirms)
Post a manual ledger adjustment	✅	❌
Sales / profit analytics	✅	❌
Add/disable a worker account	✅	❌
Configure worker discount limit	✅	❌
Real-time sale notifications	✅	❌
Enforced by Express middleware — authenticate() then authorize(role) — on every route.

5. Data Model (Firestore — flat, no tenant nesting)
products/{productId}
  name, category, sku,
  unitType: BASE|COUNT,
  baseUnit: "g"|"ml"|"pc",
  displayUnit: "kg"|"L"|"packet"|"pc",
  unitConversionFactor: number,
  purchasePrice, sellingPrice,
  currentStock (baseUnit), minimumStock (baseUnit),
  gstPercent, supplierId, isActive

customers/{customerId}
  name, phone, outstandingBalance (cached, derived from ledger — never edited directly),
  totalPurchases, totalBills, lastPurchaseAt,
  isActive                                  // NEW — soft delete, matches products (Fix #8)

customers/{customerId}/ledger/{entryId}
  type: SALE_CREDIT | PAYMENT_APPLIED | ADJUSTMENT | RETURN_CREDIT,
  amount, direction: DEBIT|CREDIT,
  referenceType: BILL|PAYMENT|RETURN|MANUAL, referenceId,
  resultingBalance,                         // NEW — balance snapshot after this entry (see §11)
  createdBy, createdAt, note

payments/{paymentId}
  customerId, amount, method: CASH|UPI|OTHER,
  upiReference (optional),
  appliedTo: [{ billId, amount }],          // populated by FIFO allocation, see §6
  receivedBy, status: RECORDED|REVERSED,
  idempotencyKey, createdAt

bills/{billId}
  billNumber (sequential, generated via counters/bills — see §8),
  customerId (nullable — walk-in), workerId,
  items: [{ productId, productName, qty, unit,
            sellingPriceSnapshot, costPriceSnapshot, lineTotal,
            returnedQty }],                 // NEW — running total, see §10
  subtotal, discount, discountApprovedBy,   // NEW field, see §9
  totalAmount,
  paymentStatus: PAID|PARTIAL|CREDIT,       // updated on every payment allocation, see §6
  paymentBreakdown: { cash, upi, credit },  // CHANGED — object, not array of {method, amount}; see §12
  status: COMPLETED|REVERSED|PARTIALLY_RETURNED,
  idempotencyKey, createdAt

returns/{returnId}
  originalBillId, items: [{ productId, qty, refundAmount }],
  totalRefund, refundMethod, reason, processedBy, createdAt

products/{productId}/stockLedger/{entryId}
  type: SALE|PURCHASE|ADJUSTMENT|RETURN,
  quantityChangeBaseUnit, referenceId, createdBy, createdAt

purchases/{purchaseId}
  supplierId,
  items: [{ productId, quantity, purchasePriceSnapshot, lineTotal }],
  totalAmount, invoiceRef, createdBy, createdAt

notifications/{notificationId}
  type, title, message, referenceId,
  channel: PUSH|WHATSAPP, deliveryStatus: PENDING|SENT|FAILED,
  isRead, createdAt, lastRetryAt            // NEW — for retry cron, see §14

auditLogs/{logId}
  actorId, actorRole, action, targetType, targetId,
  beforeState, afterState, createdAt

users/{userId}
  name, phone, role: OWNER|WORKER, status: ACTIVE|INACTIVE,
  maxDiscountAmount, maxDiscountPercent     // NEW, workers only — see §9

counters/{name}                              // NEW collection — see §8
  lastNumber

dailySummary/{date}
  totalRevenue, cashTotal, upiTotal, creditTotal, billCount, grossProfit  // RENAMED from estimatedProfit
6. Ledger, Payments, and FIFO Allocation
Unchanged core split: a payment is what physically happened; a ledger entry is the accounting effect. This lets a wrong payment be reversed (new offsetting record) instead of edited in place, and customer.outstandingBalance stays derived, never directly writable.

6.1 Allocation rule (new)
When a payment is recorded against a customer with multiple open bills, it is allocated FIFO — oldest unpaid bill first by default:

POST /api/payments
 1. Fetch customer's open bills (paymentStatus: CREDIT|PARTIAL), sorted by createdAt ASC
 2. Walk the list, applying payment.amount to each bill's remaining balance
    until exhausted or bills run out
 3. For each bill touched, update its paymentStatus:
      remaining == 0        → PAID
      0 < remaining < total → PARTIAL
 4. Write payment.appliedTo = [{ billId, amount }, ...]
 5. Write PAYMENT_APPLIED ledger entry (direction: CREDIT), with resultingBalance
 6. Recompute customer.outstandingBalance
The worker/owner can optionally override with manual bill selection in the UI; FIFO is the default when no bill is specified.

6.2 Overpayment (new)
If payment.amount > customer.outstandingBalance, the request is rejected in V1:

409 Payment exceeds outstanding balance
No prepayment/wallet concept in V1. If the shop wants to accept excess cash, that's a V2+ decision requiring its own design (customer credit balance, separate from Udhaar).

7. Bill Creation — Synchronous Flow, Notification Written Before Delivery
POST /api/bills  (Express route)
 0. Client sends `idempotencyKey` with the request
 1. If a bill with this idempotencyKey already exists → return it with
    { success: true, idempotentReplay: true, bill: {...} }   // NEW, easier debugging
 2. Validate discount against worker's discount limit (§9) → 403 if exceeded
 3. Firestore transaction:
      - allocate next billNumber from counters/bills (§8)
      - validate stock for every item (base units); insufficient → abort, 409
      - create bill doc (with price snapshots, returnedQty: 0 per line)
      - decrement stock, write stockLedger entries
      - if Udhaar portion → write SALE_CREDIT ledger entry (with resultingBalance),
        recompute outstandingBalance
      - update dailySummary/{today}
    COMMIT
 4. Write an auditLog entry
 5. Respond 200 to the app — the worker sees "Bill Created" immediately
 6. AFTER responding:
      a. Create notifications/{id} doc FIRST, deliveryStatus: PENDING   // ORDER FIXED
      b. Attempt FCM push (try/catch)
      c. On success → deliveryStatus: SENT
         On failure → deliveryStatus: FAILED (doc already exists, so it's
         visible in the notification list either way — this was the bug in v3.0)
dailySummary remains updated inside the same transaction as the bill (kept from v3.0, not moved out — see §12 rationale). It is explicitly documented as a derived, rebuildable cache, not a source of truth: if it ever drifts, it can be recomputed from bills for that date.

Idempotency keys (client-generated UUID) remain required for: creating a bill, recording a payment, recording a stock purchase.

8. Bill Numbering — Concurrency-Safe
billNumber must not be derived from bills.length + 1 or Date.now() — both break under two workers billing simultaneously.

counters/bills
  { lastNumber: 103 }
Inside the same Firestore transaction that creates the bill:

transaction.get(counters/bills) → 103
transaction.update(counters/bills, { lastNumber: 104 })
bill.billNumber = 104
This guarantees uniqueness and monotonicity even under concurrent writes.

9. Worker Discount Limits (new)
users/{userId} (worker accounts) now carries:

maxDiscountAmount: number   // absolute ₹ cap, e.g. 500
maxDiscountPercent: number  // % cap, e.g. 5
Enforced server-side in POST /bills, not just in the UI:

if (bill.discount > min(maxDiscountAmount, subtotal * maxDiscountPercent / 100))
   → 403 Discount exceeds your limit
Owners are unlimited by default (or configurable). Any bill with a discount is stamped discountApprovedBy for audit purposes. If a worker needs to exceed their limit, the flow is: owner overrides in person, or owner raises the worker's limit — no in-app "request approval" workflow in V1 (keeps this simple, as the rest of the system is).

10. Returns & Corrections
Still new records, never edits to the original bill.

10.1 Return-quantity guard (new)
Each bill line now tracks returnedQty (starts at 0, incremented on each approved return). Before creating a returns doc:

returnableQty = originalLineQty - line.returnedQty
if (requestedReturnQty > returnableQty) → 409 Exceeds returnable quantity
On approval: increment bill.items[i].returnedQty, write RETURN stock ledger entry (restock), and either refund cash/UPI or write RETURN_CREDIT ledger entry (with resultingBalance). Original bill is marked PARTIALLY_RETURNED or REVERSED if fully returned — never edited otherwise.

A manual balance correction remains an ADJUSTMENT ledger entry with a required reason, owner-only, logged in auditLogs.

11. Ledger Balance Traceability (new)
Every ledger entry (SALE_CREDIT, PAYMENT_APPLIED, ADJUSTMENT, RETURN_CREDIT) now stores resultingBalance — the customer's outstanding balance after this entry, not just the delta. This makes a disputed balance debuggable by reading one ledger entry instead of replaying the full history.

12. Payment Breakdown & Methods (revised)
OTHER is kept as a payment method (cheque/bank transfer are common enough for supplier-adjacent transactions) — dropping it entirely was reconsidered. What changes: Udhaar/credit is modeled as a settlement type, not a payment method, and a bill's split is now an explicit object rather than an array:

paymentBreakdown: {
  cash: number,
  upi: number,
  other: number,
  credit: number   // the Udhaar portion — drives SALE_CREDIT ledger entry
}
This removes ambiguity between "how was it paid" and "how much is still owed," which the v3.0 array-of-{method, amount} conflated.

13. Owner Dashboard & Analytics (revised access path)
Financial dashboard numbers are now served through an authenticated, authorized endpoint rather than a direct Firestore listener:

GET /api/analytics/dashboard    // owner-only, validated by Express
returns today's/month's/lifetime revenue, bill count, payment-mode breakdown, outstanding Udhaar total, stock value, low-stock items, gross profit (from snapshots), worker-wise performance.

Firestore listeners remain appropriate for:

notifications (read-only, non-sensitive, benefits from real-time push)
Other clearly non-financial live UI, if any is added later
Financial/business data no longer gets broad client-side Firestore read access — it goes through the API, where it can be authorized and shaped per role.

dailySummary/{date} backs the dashboard's fast-path queries and is documented as a derived cache (§7).

14. Owner Notifications & Retry (revised)
Mobile app has a Firestore listener on notifications (read-only) → live in-app updates while open.
FCM push sent right after the bill/payment request completes, after the notification doc is persisted (§7) — order fixed from v3.0.
New: a lightweight retry mechanism for PENDING/FAILED notifications, in case the Express process restarts mid-delivery:
node-cron, every few minutes:
  find notifications where deliveryStatus IN (PENDING, FAILED)
    AND createdAt > (now - 24h)
  retry FCM send, update deliveryStatus, set lastRetryAt
Still no Redis, no queue — just a periodic sweep inside the same process.
15. Role-Based Access Control (hardened)
authenticate()   // verifies Firebase ID token
authorize("OWNER")  // or authorize("OWNER", "WORKER")
Role source (hardened): role is never trusted from the client payload. It is set as a Firebase custom claim on the user's Auth token at account-creation/role-change time, and authenticate() reads { uid, role } from the verified token's claims — not from any request body field. users/{uid} still stores a profile record (name, phone, status) but the claim is the authority for role.

Owner-only: POST /products, POST /purchases, GET /analytics/*, POST /returns, POST /ledger/adjustment, GET /audit-logs, worker management (including discount-limit config)
Owner + Worker: POST /bills (discount-capped, §9), POST /payments, GET /products, GET /customers
Firestore rules: deny all client writes to business collections (backstop only).
Rate limiting & validation (kept): Helmet, CORS, rate limiting (especially /login, /payments, /bills), Zod validation, request body size limits.

16. Customer & Product Lifecycle
Neither customers nor products are ever hard-deleted — both carry financial/audit history. Both use isActive: false for deactivation. This was already true for products in v3.0; customers now carry the same field explicitly.

17. Inventory Units
Unchanged from v3.0:

Stock tracked internally in base units (g, ml, pc) as integers.
displayUnit + unitConversionFactor control what the worker sees.
Each bill line and stock ledger entry snapshots the transacted unit.
18. Price Snapshots
Unchanged: every bill line stores sellingPriceSnapshot/costPriceSnapshot; every purchase line stores purchasePriceSnapshot. Analytics always reads snapshots, never live product prices.

19. WhatsApp Integration — V1.5
Unchanged in mechanism, benefits from the notification-order fix (§7/§14): a WhatsApp send follows the same "persist doc first, then attempt delivery" pattern.

Bill delivery — after bill creation and owner notification.
Udhaar reminders — manual "Send Reminder" plus optional weekly node-cron job for customers above a configurable outstanding threshold.
Payment confirmation — after a payments record is created.
Requires WhatsApp Business Manager template approval (external, one-time setup).

20. Connectivity
V1 requires active internet connectivity. This is now stated explicitly so the owner does not assume offline billing exists before V2.

21. Roadmap
V1 — Core Auth & roles via Firebase custom claims · Products with defined units · Customers (with soft delete) · Billing with split payments (cash/upi/other/credit), idempotent creation with replay flag, price snapshots, discount limits, concurrency-safe bill numbers · Automatic stock update + stock ledger · Udhaar ledger separated from payments, FIFO allocation, overpayment rejection · Payment recording (idempotent) · Owner dashboard via authorized API · Owner push notifications (persist-then-send, with retry sweep) · Full audit log with resultingBalance traceability · Return-quantity guards · Manual ledger adjustments (owner) · Explicit online-only requirement

V1.5 — WhatsApp Bill delivery, Udhaar reminders, payment confirmations — via WhatsApp Business Cloud API, same persist-then-send pattern

V2 Returns/reversals UI (data model already supports it) · Barcode scanning · Bill PDF generation · Bluetooth thermal printer · Supplier management · Offline billing (local queue on the phone, synced when back online — idempotency keys already make this safe) · Optional customer prepayment/wallet (if overpayment handling is actually needed)

V3 (only if actually needed later) Multi-store support — would require re-introducing a storeId field across collections.

22. Tech Stack Summary
Layer	Choice
Mobile app	React Native (TypeScript), React Navigation, Zustand, Axios — Express API for writes and financial reads; Firestore SDK for read-only notification listener only
Backend	One Node.js + Express service (TypeScript), Zod validation, Firebase Admin SDK
Auth	Firebase Authentication + Custom Claims for role
Database	Firebase Firestore (flat collections, single shop)
Scheduled tasks	node-cron inside the Express process (bill reminders, notification retry sweep)
Push notifications	Firebase Cloud Messaging
Customer messaging (V1.5)	WhatsApp Business Cloud API
File/image storage	Firebase Storage (product photos, if needed)
Hosting	Any single always-on instance — Render/Railway hobby tier, a small VPS, or one Cloud Run service with min-instances=1
23. Success Metrics
Zero duplicate bills/payments under retry or double-tap conditions
100% of bills automatically and correctly decrement stock in base units
Owner sees each sale notification within a few seconds, without it ever delaying the bill response; no notification is ever lost even if FCM fails or the server restarts mid-delivery
Profit/revenue reports stay correct even after prices change (verified against snapshots)
Every balance change traceable to a single ledger entry (via resultingBalance) or audit log — no direct field overwrites
No bill can be created with a discount beyond the worker's configured limit
No payment can push a customer's outstanding balance below zero
Bill numbers remain strictly sequential and unique under concurrent workers