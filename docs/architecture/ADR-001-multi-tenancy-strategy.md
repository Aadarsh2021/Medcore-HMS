# ADR-001: Multi-Tenancy Strategy

## Status
Accepted

## Context
MedCore HMS is designed to serve healthcare institutions ranging from independent clinics (30 beds) to multi-speciality hospital networks (800+ beds). Each hospital operates as a distinct tenant with its own staff, patient rosters, clinical schedules, pharmacy formulary, and financial accounting.
A key requirement is strict tenant isolation: under no circumstances should Hospital A's personnel view or modify records from Hospital B.

## Decision
We selected **Row-Level Multi-Tenancy with Server-Side ORM Scoping (`hospitalId`)**.

### Why This Approach Was Chosen:
1. **Operational Simplicity & Cost**:
   Running a dedicated PostgreSQL database per tenant (Database-per-Tenant) becomes cost-prohibitive for hundreds of clinics and complicates connection pooling across serverless or containerized micro-instances.
2. **Schema Evolution Speed**:
   Schema-per-tenant introduces severe migration latency when updating hundreds of schemas simultaneously in Prisma (`prisma migrate deploy` across dynamic schemas).
3. **Defense-in-Depth Enforcement**:
   - Every tenant entity explicitly carries a `hospitalId` foreign key and composite index (`@@index([hospitalId])`).
   - A NestJS `TenantGuard` and `TenantInterceptor` extracts the verified `hospitalId` from the authenticated user's JWT.
   - A Prisma Client Extension automatically injects `{ where: { hospitalId } }` into all database queries within tenant scope.
   - Dedicated automated integration tests run in CI to verify that cross-hospital requests receive `404 Not Found` or `403 Forbidden`.

## Consequences
- **Positive**: Single unified database schema, instant provisioning of new hospital tenants, seamless database migrations, optimized connection pooling.
- **Negative**: Developers must never write raw SQL queries bypassing the tenant context. All services and repository methods must respect tenant scoping.
