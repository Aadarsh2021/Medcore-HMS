import { BatchAllocationProposal } from '@medcore/types';

export interface CandidateBatch {
  id: string;
  batchNumber: string;
  expiryDate: Date | string;
  currentQuantity: number;
  isQuarantined: boolean;
  createdAt: Date | string;
  unitCost: any;
  mrp: any;
}

export interface FefoAllocationResult {
  allocations: BatchAllocationProposal[];
  allocatedTotal: number;
  unfulfilledQuantity: number;
  isFullyFulfillable: boolean;
}

/**
 * Authoritative Backend FEFO + FIFO Allocation Engine
 *
 * Rules:
 *   1. Hard Exclusions:
 *      - Quarantined batches (isQuarantined === true)
 *      - Expired batches (expiryDate <= currentDate)
 *      - Zero/negative stock batches (currentQuantity <= 0)
 *   2. Sorting:
 *      - Earliest expiryDate ASC (FEFO Primary)
 *      - Earliest createdAt ASC (FIFO Tie-breaker)
 *      - Deterministic id ASC (Stable final tie-breaker)
 */
export function computeFefoAllocation(
  requestedQuantity: number,
  candidateBatches: CandidateBatch[],
  currentDate: Date = new Date(),
): FefoAllocationResult {
  if (requestedQuantity <= 0) {
    return {
      allocations: [],
      allocatedTotal: 0,
      unfulfilledQuantity: 0,
      isFullyFulfillable: true,
    };
  }

  // 1. Filter eligible batches
  const validBatches = candidateBatches.filter((b) => {
    if (b.isQuarantined) return false;
    if (b.currentQuantity <= 0) return false;
    const exp = new Date(b.expiryDate);
    // Expiry date must be strictly after currentDate
    if (exp <= currentDate) return false;
    return true;
  });

  // 2. Sort by FEFO primary, FIFO tie-breaker, id final tie-breaker
  validBatches.sort((a, b) => {
    const expA = new Date(a.expiryDate).getTime();
    const expB = new Date(b.expiryDate).getTime();
    if (expA !== expB) {
      return expA - expB;
    }

    const createdA = new Date(a.createdAt).getTime();
    const createdB = new Date(b.createdAt).getTime();
    if (createdA !== createdB) {
      return createdA - createdB;
    }

    return a.id.localeCompare(b.id);
  });

  const allocations: BatchAllocationProposal[] = [];
  let remainingToFulfill = requestedQuantity;

  for (const batch of validBatches) {
    if (remainingToFulfill <= 0) break;

    const alloc = Math.min(remainingToFulfill, batch.currentQuantity);
    const reason = allocations.length === 0 ? 'FEFO_PRIMARY' : 'FIFO_TIE_BREAKER';

    allocations.push({
      batchId: batch.id,
      batchNumber: batch.batchNumber,
      expiryDate: new Date(batch.expiryDate).toISOString(),
      availableQuantity: batch.currentQuantity,
      allocatedQuantity: alloc,
      unitCost: Number(batch.unitCost),
      mrp: Number(batch.mrp),
      reason,
    });

    remainingToFulfill -= alloc;
  }

  const allocatedTotal = requestedQuantity - remainingToFulfill;

  return {
    allocations,
    allocatedTotal,
    unfulfilledQuantity: remainingToFulfill,
    isFullyFulfillable: remainingToFulfill === 0,
  };
}
