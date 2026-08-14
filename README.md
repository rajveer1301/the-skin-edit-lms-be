# The Skin Edit — Clinic Management API

Backend for **The Skin Edit** skin, hair & wellness clinic management system.
Built with **NestJS + Prisma + PostgreSQL**, and designed contract-first to match the
Angular frontend's `API_ENDPOINTS` and TypeScript models exactly.

## Tech stack

- **NestJS 11** (modular architecture, global guards, validation pipe)
- **Prisma 6** ORM with **PostgreSQL**
- **JWT auth** (access + refresh tokens) with **Passport** and **bcrypt**
- **Role-based access control** — `ADMIN`, `DOCTOR`, `RECEPTIONIST`, `ACCOUNTANT`
- **class-validator / class-transformer** for DTO validation

## Prerequisites

- Node.js >= 20.19 (project developed on Node 22)
- PostgreSQL 14+ running locally, **or** Docker (a `docker-compose.yml` is provided)

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env    # adjust DATABASE_URL / secrets if needed

# 3. Start PostgreSQL
#    Option A — Docker:
docker compose up -d
#    Option B — use an existing local Postgres and point DATABASE_URL at it

# 4. Apply the schema and generate the client
npx prisma migrate dev

# 5. Seed demo data (mirrors the frontend mock data)
npm run db:seed

# 6. Run the API
npm run start:dev
```

The API listens on `http://localhost:3000/api` (global prefix `api`).
CORS is enabled for `CORS_ORIGIN` (default `http://localhost:4200`).

## Connecting the frontend

In the Angular app set `environment.development.ts`:

```ts
export const environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api',
  useMock: false, // turn the mock interceptor OFF to hit this backend
};
```

## Demo accounts

All seeded users share the password **`password123`**.

| Role         | Email                        |
| ------------ | ---------------------------- |
| Admin        | admin@theskinedit.com        |
| Doctor       | doctor@theskinedit.com       |
| Doctor       | neha@theskinedit.com         |
| Receptionist | reception@theskinedit.com    |
| Accountant   | accounts@theskinedit.com     |

## API surface

All routes are prefixed with `/api`. Every route requires a `Bearer` access token
except `POST /auth/login`, `POST /auth/refresh`, and `GET /health`.

| Area         | Endpoints                                                                                             |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Auth         | `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `GET /auth/me`                          |
| Patients     | CRUD `/patients`, plus `/patients/:id/{appointments,treatments,invoices,documents}`                    |
| Appointments | CRUD `/appointments`, `PATCH /appointments/:id/status`                                                 |
| Services     | CRUD `/services`                                                                                       |
| Treatments   | CRUD `/treatments`                                                                                     |
| Billing      | CRUD `/invoices`, `POST /invoices/:id/payments`, `GET /payments`                                       |
| Staff        | CRUD `/staff`, `GET /roles`                                                                            |
| Inventory    | CRUD `/inventory/products`, `GET|POST /inventory/stock-movements`                                      |
| Leads        | CRUD `/leads`, `PATCH /leads/:id/status`, `POST /leads/:id/convert`                                    |
| Dashboard    | `GET /dashboard/summary`                                                                               |
| Reports      | `GET /reports/{revenue,appointments,patients}`                                                         |

List endpoints support `?page=&pageSize=&search=&sort=&order=` and return
`{ data, total, page, pageSize }`.

## Scripts

| Script                  | Description                              |
| ----------------------- | ---------------------------------------- |
| `npm run start:dev`     | Run with hot reload                      |
| `npm run build`         | Compile to `dist/`                       |
| `npm run start:prod`    | Run compiled build                       |
| `npm run prisma:migrate`| `prisma migrate dev`                     |
| `npm run db:seed`       | Seed demo data                           |
| `npm run db:reset`      | Reset DB, re-apply migrations + seed     |
| `npm run lint`          | ESLint                                   |

## Project structure

```
prisma/
  schema.prisma      # data model (mirrors frontend TS interfaces)
  seed.ts            # demo data seed
src/
  auth/              # login/refresh/logout/me, JWT strategy
  common/            # guards, decorators, DTOs, filters, mappers, pagination
  prisma/            # PrismaModule + PrismaService
  patients/ appointments/ services/ treatments/
  billing/ staff/ inventory/ leads/ analytics/
  main.ts app.module.ts
```
