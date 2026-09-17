import { Prisma } from '@prisma/client';

export interface CalculatedLineItem {
  type: any;
  description: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  tax: number;
  lineSubtotal: number;
  totalPrice: number;
  appointmentId?: string;
  encounterId?: string;
  prescriptionId?: string;
  dispenseId?: string;
  labOrderId?: string;
  labTestId?: string;
}

export interface CalculatedInvoiceTotals {
  items: CalculatedLineItem[];
  subtotal: number;
  taxAmount: number;
  discountAmount: number;
  totalAmount: number;
  outstandingAmount: number;
}

/**
 * Deterministic financial calculator for healthcare billing.
 * Eliminates IEEE-754 binary floating point precision issues.
 */
export class FinancialCalculator {
  /**
   * Rounds a numerical monetary value to 2 decimal places using round half-up.
   */
  static round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  /**
   * Evaluates line items and derives aggregate totals authoritatively on the server.
   */
  static computeInvoice(items: Array<{
    type?: any;
    description: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    tax?: number;
    appointmentId?: string;
    encounterId?: string;
    prescriptionId?: string;
    dispenseId?: string;
    labOrderId?: string;
    labTestId?: string;
  }>, paidAmount: number = 0): CalculatedInvoiceTotals {
    let subtotalAcc = 0;
    let taxAcc = 0;
    let discountAcc = 0;

    const calculatedItems: CalculatedLineItem[] = items.map((item) => {
      const qty = Math.max(1, Math.floor(item.quantity));
      const unitPrice = Math.max(0, this.round2(item.unitPrice));
      const lineSubtotal = this.round2(qty * unitPrice);

      // Discount cannot exceed line subtotal
      const rawDiscount = item.discount ? Math.max(0, this.round2(item.discount)) : 0;
      const discount = Math.min(lineSubtotal, rawDiscount);

      // Tax is computed on taxable base (subtotal - discount)
      const taxableBase = Math.max(0, this.round2(lineSubtotal - discount));
      const tax = item.tax ? Math.max(0, this.round2(item.tax)) : 0;

      const totalPrice = this.round2(taxableBase + tax);

      subtotalAcc += lineSubtotal;
      discountAcc += discount;
      taxAcc += tax;

      return {
        type: item.type || 'CONSULTATION',
        description: item.description,
        quantity: qty,
        unitPrice,
        discount,
        tax,
        lineSubtotal,
        totalPrice,
        appointmentId: item.appointmentId,
        encounterId: item.encounterId,
        prescriptionId: item.prescriptionId,
        dispenseId: item.dispenseId,
        labOrderId: item.labOrderId,
        labTestId: item.labTestId,
      };
    });

    const subtotal = this.round2(subtotalAcc);
    const discountAmount = this.round2(discountAcc);
    const taxAmount = this.round2(taxAcc);
    const totalAmount = this.round2(subtotal - discountAmount + taxAmount);
    const outstandingAmount = Math.max(0, this.round2(totalAmount - paidAmount));

    return {
      items: calculatedItems,
      subtotal,
      taxAmount,
      discountAmount,
      totalAmount,
      outstandingAmount,
    };
  }

  /**
   * Helper to convert Prisma Decimal to JS number safely.
   */
  static toNumber(val: Prisma.Decimal | number | null | undefined): number {
    if (val === null || val === undefined) return 0;
    if (typeof val === 'number') return val;
    return val.toNumber();
  }
}
