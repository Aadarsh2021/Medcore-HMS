import { LabResultFlag } from '@medcore/types';

export interface EvaluationInput {
  resultValue: string;
  referenceRangeMin?: number | null;
  referenceRangeMax?: number | null;
  criticalLow?: number | null;
  criticalHigh?: number | null;
}

export interface EvaluationResult {
  flag: LabResultFlag;
  isCritical: boolean;
  numericValue: number | null;
}

export class RangeEvaluator {
  /**
   * Authoritative medical range and critical limit evaluation.
   * Priority of evaluation:
   * 1. Test-specific persisted critical limits:
   *    - if criticalLow defined and numericValue <= criticalLow -> CRITICAL
   *    - if criticalHigh defined and numericValue >= criticalHigh -> CRITICAL
   * 2. Reference range limits:
   *    - if referenceRangeMin defined and numericValue < referenceRangeMin -> LOW
   *    - if referenceRangeMax defined and numericValue > referenceRangeMax -> HIGH
   * 3. Normal range:
   *    - otherwise -> NORMAL
   *
   * Note: Arbitrary heuristic rules (such as > 2x upper or < 0.5x lower) are strictly prohibited.
   * Client-submitted flag is ignored.
   */
  static evaluate(input: EvaluationInput): EvaluationResult {
    const rawStr = input.resultValue?.trim();
    if (!rawStr) {
      return { flag: LabResultFlag.NORMAL, isCritical: false, numericValue: null };
    }

    // Parse float, stripping leading relational operators if present
    const cleanNumStr = rawStr.replace(/^[<>]=?\s*/, '');
    const num = parseFloat(cleanNumStr);
    const isNumeric = !isNaN(num) && isFinite(num);

    if (!isNumeric) {
      // Qualitative text result check
      const upper = rawStr.toUpperCase();
      if (upper.includes('CRITICAL') || upper.includes('PANIC')) {
        return { flag: LabResultFlag.CRITICAL, isCritical: true, numericValue: null };
      }
      if (
        upper.includes('POSITIVE') ||
        upper.includes('REACTIVE') ||
        upper.includes('ABNORMAL') ||
        upper.includes('HIGH')
      ) {
        return { flag: LabResultFlag.HIGH, isCritical: false, numericValue: null };
      }
      return { flag: LabResultFlag.NORMAL, isCritical: false, numericValue: null };
    }

    // 1. Authoritative test-specific critical panic check
    if (input.criticalLow != null && num <= input.criticalLow) {
      return { flag: LabResultFlag.CRITICAL, isCritical: true, numericValue: num };
    }
    if (input.criticalHigh != null && num >= input.criticalHigh) {
      return { flag: LabResultFlag.CRITICAL, isCritical: true, numericValue: num };
    }

    // 2. Reference range low/high check
    if (input.referenceRangeMin != null && num < input.referenceRangeMin) {
      return { flag: LabResultFlag.LOW, isCritical: false, numericValue: num };
    }
    if (input.referenceRangeMax != null && num > input.referenceRangeMax) {
      return { flag: LabResultFlag.HIGH, isCritical: false, numericValue: num };
    }

    return { flag: LabResultFlag.NORMAL, isCritical: false, numericValue: num };
  }
}
