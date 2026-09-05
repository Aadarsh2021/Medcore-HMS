# PHASE 7 — API CONTRACT SPECIFICATION
## Pharmacy & Inventory Management
## MedCore HMS

---

## 1. Global Conventions
- All endpoints use JSON payloads and the established MedCore response envelope:
  ```typescript
  export interface ApiResponse<T = unknown> {
    success: true;
    data: T;
    message?: string;
  }
  ```
- All endpoints require Supabase Auth Bearer Token in `Authorization: Bearer <JWT>`.
- All requests are tenant-isolated via `TenantGuard` and `PrismaClient` tenant extension.
- Dispensing and Intake mutation endpoints accept `Idempotency-Key: <UUID>`.

---

## 2. Endpoint Catalog

### 2.1 Pharmacy Prescription Queue & Fulfillment Detail

#### `GET /api/pharmacy/queue`
Retrieves pending prescriptions eligible for dispensing within the hospital.
- **Roles**: `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Query Parameters**:
  - `status`: `ISSUED` | `PARTIALLY_DISPENSED` (default: both)
  - `search`: string (matches UHID, patient name, or prescriptionNumber)
  - `page`: number (default: 1)
  - `limit`: number (default: 20, max: 50)
- **Response 200**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "rx-uuid",
        "prescriptionNumber": "RX-MGH-2026-000102",
        "encounterId": "enc-uuid",
        "patient": {
          "id": "pt-uuid",
          "uhid": "UHID-MGH-2026-00045",
          "fullName": "Rahul Sharma",
          "gender": "MALE",
          "age": 34
        },
        "doctor": {
          "id": "doc-uuid",
          "fullName": "Dr. Ananya Iyer",
          "specialization": "General Medicine"
        },
        "status": "ISSUED",
        "issuedAt": "2026-09-05T14:30:00.000Z",
        "totalItems": 2,
        "fulfilledItems": 0
      }
    ],
    "meta": {
      "page": 1,
      "limit": 20,
      "total": 1,
      "totalPages": 1
    }
  }
  ```

#### `GET /api/pharmacy/prescriptions/:id/dispense-plan`
Generates a real-time FEFO batch allocation preview for a prescription before committing.
- **Roles**: `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Response 200**:
  ```json
  {
    "success": true,
    "data": {
      "prescriptionId": "rx-uuid",
      "prescriptionNumber": "RX-MGH-2026-000102",
      "patientName": "Rahul Sharma",
      "items": [
        {
          "prescriptionItemId": "item-1-uuid",
          "medicineId": "med-1-uuid",
          "medicineName": "Amoxicillin 500mg Capsule",
          "prescribedQuantity": 15,
          "alreadyDispensedQuantity": 0,
          "remainingQuantity": 15,
          "recommendedAllocations": [
            {
              "batchId": "batch-101-uuid",
              "batchNumber": "AMX-2026-A",
              "expiryDate": "2027-02-15T00:00:00.000Z",
              "availableStock": 10,
              "allocateQuantity": 10,
              "unitCost": "4.50",
              "mrp": "8.00"
            },
            {
              "batchId": "batch-102-uuid",
              "batchNumber": "AMX-2026-B",
              "expiryDate": "2027-08-30T00:00:00.000Z",
              "availableStock": 50,
              "allocateQuantity": 5,
              "unitCost": "4.80",
              "mrp": "8.00"
            }
          ],
          "isFullyFulfillable": true
        }
      ]
    }
  }
  ```

---

### 2.2 Medication Dispensing

#### `POST /api/pharmacy/prescriptions/:id/dispense`
Executes row-locked batch deduction, updates prescription item counters, records stock movements, and generates a dispense record.
- **Roles**: `PHARMACIST`, `HOSPITAL_ADMIN`
- **Headers**:
  - `Idempotency-Key`: UUID (Optional but recommended)
- **Request Body**:
  ```json
  {
    "notes": "Dispensed full course to patient Rahul Sharma",
    "items": [
      {
        "prescriptionItemId": "item-1-uuid",
        "allocations": [
          {
            "batchId": "batch-101-uuid",
            "quantity": 10
          },
          {
            "batchId": "batch-102-uuid",
            "quantity": 5
          }
        ]
      }
    ]
  }
  ```
- **Response 201**:
  ```json
  {
    "success": true,
    "data": {
      "dispenseId": "dsp-uuid",
      "dispenseNumber": "DSP-MGH-2026-000045",
      "prescriptionId": "rx-uuid",
      "prescriptionNumber": "RX-MGH-2026-000102",
      "prescriptionStatus": "DISPENSED",
      "dispensedAt": "2026-09-05T15:00:00.000Z",
      "items": [
        {
          "prescriptionItemId": "item-1-uuid",
          "medicineName": "Amoxicillin 500mg Capsule",
          "quantityDispensed": 15,
          "dispensedBatches": [
            { "batchNumber": "AMX-2026-A", "quantity": 10 },
            { "batchNumber": "AMX-2026-B", "quantity": 5 }
          ]
        }
      ]
    },
    "message": "Prescription successfully dispensed"
  }
  ```
- **Error Responses**:
  - `400 Bad Request`: Allocation quantity exceeds remaining prescribed quantity.
  - `409 Conflict`: Target batch has insufficient stock; or prescription is in `DRAFT` or `CANCELLED` status.
  - `422 Unprocessable Entity`: Selected batch is quarantined or expired.

---

### 2.3 Inventory & Batch Management

#### `GET /api/pharmacy/inventory`
Lists all catalog medicines with real-time aggregated batch stock, reorder levels, and low-stock indicators.
- **Roles**: `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Query Parameters**:
  - `search`: string (medicine name or generic name)
  - `category`: string
  - `isLowStock`: boolean
  - `page`: number
  - `limit`: number
- **Response 200**:
  ```json
  {
    "success": true,
    "data": [
      {
        "medicineId": "med-1-uuid",
        "name": "Amoxicillin 500 mg",
        "genericName": "Amoxicillin",
        "category": "Antibiotics",
        "form": "CAPSULE",
        "strength": "500 mg",
        "reorderLevel": 100,
        "availableStock": 45,
        "isLowStock": true,
        "activeBatchesCount": 2
      }
    ]
  }
  ```

#### `GET /api/pharmacy/medicines/:medicineId/batches`
Lists all batches for a specific medicine, including physical stock, unit cost, MRP, expiry date, and quarantine status.
- **Roles**: `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Response 200**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "batch-101-uuid",
        "batchNumber": "AMX-2026-A",
        "manufacturingDate": "2025-02-01T00:00:00.000Z",
        "expiryDate": "2027-02-15T00:00:00.000Z",
        "initialQuantity": 100,
        "currentQuantity": 10,
        "unitCost": "4.50",
        "mrp": "8.00",
        "isQuarantined": false,
        "isExpired": false
      }
    ]
  }
  ```

#### `POST /api/pharmacy/batches/:id/quarantine`
Toggles quarantine status for a batch with mandatory justification.
- **Roles**: `PHARMACIST`, `HOSPITAL_ADMIN`
- **Request Body**:
  ```json
  {
    "isQuarantined": true,
    "reason": "Manufacturer voluntary recall notice REF-2026-09"
  }
  ```
- **Response 200**:
  ```json
  {
    "success": true,
    "data": {
      "batchId": "batch-101-uuid",
      "batchNumber": "AMX-2026-A",
      "isQuarantined": true
    },
    "message": "Batch quarantine status updated"
  }
  ```

---

### 2.4 Stock Intake (Goods Receipt Note / GRN)

#### `POST /api/pharmacy/stock-receipts`
Records supplier shipment delivery, creates or increments physical batches, and logs `PURCHASE_RECEIPT` movements.
- **Roles**: `PHARMACIST`, `HOSPITAL_ADMIN`
- **Request Body**:
  ```json
  {
    "supplierName": "Cipla Healthcare Distributors",
    "invoiceNumber": "INV-2026-9812",
    "invoiceDate": "2026-09-01T00:00:00.000Z",
    "notes": "Monthly formulary replenishment",
    "items": [
      {
        "medicineId": "med-1-uuid",
        "batchNumber": "AMX-2026-C",
        "manufacturingDate": "2026-08-01T00:00:00.000Z",
        "expiryDate": "2028-08-01T00:00:00.000Z",
        "quantityReceived": 200,
        "unitCost": 4.50,
        "mrp": 8.00
      }
    ]
  }
  ```
- **Response 201**:
  ```json
  {
    "success": true,
    "data": {
      "receiptId": "grn-uuid",
      "receiptNumber": "GRN-MGH-2026-000012",
      "supplierName": "Cipla Healthcare Distributors",
      "totalCost": "900.00",
      "itemsReceived": 1
    },
    "message": "Stock receipt successfully processed and inventory updated"
  }
  ```

---

### 2.5 Stock Adjustments & Returns

#### `POST /api/pharmacy/batches/:id/adjust`
Logs physical inventory discrepancies or damage write-offs with mandatory audit trail.
- **Roles**: `PHARMACIST`, `HOSPITAL_ADMIN`
- **Request Body**:
  ```json
  {
    "adjustmentType": "DAMAGE_WRITEOFF",
    "quantityChange": -3,
    "reason": "Ampoules cracked during shelf reorganization"
  }
  ```
- **Response 200**:
  ```json
  {
    "success": true,
    "data": {
      "batchId": "batch-101-uuid",
      "previousQuantity": 10,
      "newQuantity": 7,
      "movementId": "mvt-uuid"
    },
    "message": "Inventory adjustment successfully recorded"
  }
  ```

---

### 2.6 Pharmacy Reporting & Auditing

#### `GET /api/pharmacy/reports/expiry`
Retrieves batches categorized by expiration thresholds.
- **Roles**: `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Query Parameters**:
  - `bracket`: `EXPIRED` | `DAYS_30` | `DAYS_60` | `DAYS_90`
- **Response 200**:
  ```json
  {
    "success": true,
    "data": {
      "bracket": "DAYS_30",
      "count": 3,
      "batches": [
        {
          "batchId": "batch-99-uuid",
          "batchNumber": "PAR-2024-X",
          "medicineName": "Paracetamol 500 mg",
          "currentQuantity": 40,
          "expiryDate": "2026-09-28T00:00:00.000Z",
          "daysRemaining": 23
        }
      ]
    }
  }
  ```

#### `GET /api/pharmacy/stock-movements`
Queries the append-only inventory ledger for a specific batch or medicine.
- **Roles**: `PHARMACIST`, `HOSPITAL_ADMIN`, `SUPER_ADMIN`
- **Query Parameters**:
  - `medicineId`: string
  - `batchId`: string
  - `movementType`: `StockMovementType`
  - `page`: number
  - `limit`: number
- **Response 200**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "mvt-uuid",
        "movementType": "DISPENSE",
        "quantity": -5,
        "balanceBefore": 10,
        "balanceAfter": 5,
        "referenceType": "PRESCRIPTION",
        "referenceId": "rx-uuid",
        "performedBy": "Rajesh Kumar (Pharmacist)",
        "createdAt": "2026-09-05T15:00:00.000Z"
      }
    ]
  }
  ```
