# MedCore HMS — Frontend Product Architecture Specification

## 1. System & Technology Foundation

MedCore HMS frontend is an enterprise Hospital Operating System user experience built with:
- **Framework**: Next.js 15 (App Router) with strict static export mode (`output: 'export'`)
- **Language**: TypeScript 5.3 (strict type checking enabled)
- **Monorepo**: pnpm workspace integrating `@medcore/types` shared contracts
- **State Management**: Zustand stores with reactive synchronization (`authStore.ts`)
- **Styling**: Tailored Tailwind CSS system with clinical high-density tokens, dark/light clinical palettes, and glassmorphism micro-interactions
- **Icons**: Lucide React clinical & administrative iconography
- **Security**: Strict zero-leakage policy (no JWTs, internal UIDs, database engines, or credentials exposed in UI or console logs)

---

## 2. Route Architecture & Static Export Strategy

Because the application is configured with `output: 'export'` for high-speed edge deployment (e.g. Firebase App Hosting, Cloud Storage CDN), build-time dynamic routes like `[id]/page.tsx` are strictly prohibited.

All runtime entity details are accessed via canonical query parameters wrapped in React `<Suspense>` boundaries:

| Module | Canonical Route | Query-Param Dynamic Spec |
|---|---|---|
| **Root & Auth** | `/` & `/login` | N/A |
| **Main Dashboard** | `/dashboard` | Active Role Workspace Router |
| **Patients** | `/dashboard/patients` | `/dashboard/patients/detail?id=<uuid>` & `/dashboard/patients/new` |
| **Appointments** | `/dashboard/appointments` | `/dashboard/appointments/detail?id=<uuid>` & `/dashboard/appointments/new` |
| **Doctors** | `/dashboard/doctors` | `/dashboard/doctors/detail?id=<uuid>` & `/dashboard/doctors/new` |
| **Departments** | `/dashboard/departments` | Filterable by department code |
| **Clinical EMR** | `/dashboard/clinical` | Active encounter consultation workspace |
| **Prescriptions** | `/dashboard/prescriptions` | `/dashboard/prescriptions/detail?id=<uuid>` |
| **Central Pharmacy** | `/dashboard/pharmacy` | Real Phase 7 FEFO dispensing & inventory hub |
| **Laboratory** | `/dashboard/laboratory` | Order intake, specimen accession, result entry & approval |
| **Billing & Cashier** | `/dashboard/billing` | `/dashboard/billing/invoices?id=<uuid>`, `/payments`, `/insurance` |
| **Reports** | `/dashboard/reports` | Tabbed operational, clinical, pharmacy, and billing analytics |
| **Administration** | `/dashboard/admin` | Staff directory, user creation, facility configuration & audit logs |
| **Settings** | `/dashboard/settings` | Account credentials, notification rules, slot durations & alert settings |

---

## 3. Dedicated Role Workspaces Matrix

The MedCore HMS frontend provides dedicated workspaces across all 9 roles:

```
+------------------+---------------------------------------------------------------------------------+
| Role             | Specialized Operational Focus                                                  |
+------------------+---------------------------------------------------------------------------------+
| SUPER_ADMIN      | Multi-tenant hospital governance, facility health, cross-hospital metrics       |
| HOSPITAL_ADMIN   | Executive facility census, doctor duty roster, department bed capacity          |
| DOCTOR           | Outpatient consultation queue, patient 360, ICD-10 diagnosis, Rx ordering       |
| NURSE            | Triage station, vitals recording queue (BP/HR/SpO2/BMI), clinical prep tasks   |
| RECEPTIONIST     | Patient intake, registration wizard, arrival check-in queue, doctor schedules   |
| PHARMACIST       | Phase 7 FEFO dispensing queue, physical batch management, stock movements (GRN) |
| LAB_TECHNICIAN   | Pathology order worklist, specimen collection/accession, result entry & flags   |
| ACCOUNTANT       | Cashier desk, consolidated invoices, payment settlement, TPA claims             |
| PATIENT          | Personal health portal: appointments, active prescriptions, lab reports, bills  |
+------------------+---------------------------------------------------------------------------------+
```

---

## 4. Design System Specification

A unified, reusable design system implemented in `apps/web/src/components/ui`:
- **Inputs & Forms**: `Input`, `Textarea`, `Select`, `Checkbox`, `Switch`
- **Actions**: `Button` (with `primary`, `secondary`, `outline`, `destructive`, `ghost`, `clinical` variants), `IconButton`
- **Containers**: `Card` (with `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`), `StatCard`
- **Overlays**: `Modal` (accessible dialog with Escape and body scroll lock), `Drawer` (slide-out side panel), `ConfirmDialog`
- **Status & Indicators**: `Badge`, `StatusBadge` (with clinical status semantics: `CONFIRMED`, `CHECKED_IN`, `IN_PROGRESS`, `DISPENSED`, `PARTIALLY_DISPENSED`, `APPROVED`, etc.)
- **Banners & Alerts**: `Alert`, `ClinicalAlert` (allergy alert, drug interaction, panic lab value), `PatientBanner`, `DoctorBanner`, `Tooltip`
- **Navigation & Layout**: `AppShell`, `Sidebar`, `TopBar`, `Breadcrumbs`, `PageHeader`, `Tabs`, `Stepper`, `Timeline`
- **Data & Tables**: `DataTable` (generic, typed, sortable, filterable, paginated), `Pagination`
- **Async & Feedback**: `Skeleton`, `EmptyState`, `ErrorState`, `LoadingState`, `Progress`
- **Global Modals**: `GlobalSearch` (Cmd/Ctrl+K keyboard palette), `NotificationCenter` (categorized operational alerts)

---

## 5. Service Interface & Adapter Architecture

To maintain a clean separation of concerns and prevent mock data from polluting React components, all data operations flow through typed service interfaces:

```
React Component UI
        |
        v
Typed Service Interface (e.g. PharmacyService, BillingService, LaboratoryService)
        |
        +---> Production Http Adapter (when real backend API exists, e.g. /api/pharmacy, /api/patients)
        |
        +---> Isolated Development Adapter (when backend API is pending, e.g. Laboratory, Billing)
```

### Backend Integration Status:
1. **Real Backend APIs (Phases 1–7)**:
   - Authentication (`/api/auth/*`)
   - Patients (`/api/patients/*`)
   - Doctors (`/api/doctors/*`)
   - Departments (`/api/departments/*`)
   - Appointments (`/api/appointments/*`)
   - Encounters (`/api/encounters/*`)
   - Prescriptions (`/api/prescriptions/*`)
   - Central Pharmacy & Inventory (`/api/pharmacy/*`)
2. **Development Adapters (Pending Backend Phases)**:
   - Laboratory Service (`laboratory.service.ts` — pending Phase 8)
   - Billing & Cashier Service (`billing.service.ts` — pending Phase 9)
   - Reports & Analytics (`reports.service.ts`)
   - Hospital Notifications (`notifications.service.ts`)

Every development adapter clearly signals its status in the UI via an explicit **"Payment Integration Pending"** or **"Adapter Mode"** badge, strictly preventing any false claims of production financial or diagnostic persistence.
