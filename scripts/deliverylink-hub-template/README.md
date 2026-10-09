# DeliveryLinkHub

DeliveryLinkHub is an independent delivery-management service. It has its own MongoDB database, users, sessions, tenants, couriers and orders. It does not import or synchronize data from another point-of-sale application.

## Requirements and setup

- Node.js 20 or newer
- MongoDB 6 or newer

Copy `.env.example` to `.env` and set unique values for `MONGODB_URI`, `JWT_SECRET`, `HUB_ADMIN_EMAIL`, and `HUB_ADMIN_PASSWORD`. Keep `.env` private; it is excluded from Git. Install dependencies with `npm install`, `npm --prefix back-end install`, and `npm --prefix front-end install`.

Run the API and web app with `npm run dev`. The API listens on `PORT` and the Vite app on port 5173. Build the web app with `npm run build`; run API tests with `npm test`.

On first API startup, the service creates the platform administrator from `HUB_ADMIN_EMAIL` and `HUB_ADMIN_PASSWORD` only when there are no users. Later changes to those environment values do not reset an existing account.

## Product boundary

The Hub is its own application and database. It has no credentials, endpoints, imports, or runtime dependencies from other products. Configure backups, TLS, allowed `CORS_ORIGIN`, and secret rotation before exposing it publicly.

## Main API

- `POST /api/auth/login` — platform or commerce login with email/password.
- `GET|POST /api/platform/tenants` — list or create a commerce and its initial administrator (platform administrator).
- `POST /api/platform/tenants/:tenantId/integration-credentials` — issue a one-time displayed API key; only its SHA-256 digest is stored.
- `GET|POST /api/tenant/orders` — list or create manual orders (commerce administrator).
- `GET|POST /api/tenant/couriers` — list or register couriers (commerce administrator).
- `POST /api/tenant/orders/:id/dispatch` — assign a courier within the authenticated commerce.
- `POST /api/integrations/orders` — accept a generic third-party POS order using `x-hub-api-key`, a stable `externalReference`, customer, address, items, and amounts. Identical retries return the existing order; conflicting payloads return HTTP 409. Integration and public tracking routes are rate limited.
- `GET /api/tracking/:token` — public delivery status; returns only customer-safe fields.

All integration credentials are scoped to a single commerce and can be revoked by the platform administrator. Do not send customer secrets or Hub credentials in URLs.
