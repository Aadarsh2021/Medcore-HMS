import { Injectable } from '@nestjs/common';

export interface Icd10Entry {
  code: string;
  description: string;
  category: string;
  isCommon?: boolean;
}

@Injectable()
export class ClinicalDictionaryService {
  // Comprehensive WHO ICD-10 curated dataset for clinical outpatient & inpatient diagnosis
  private readonly icd10Codes: Icd10Entry[] = [
    // Endocrine, Nutritional & Metabolic Diseases
    { code: 'E11.9', description: 'Type 2 diabetes mellitus without complications', category: 'Endocrine & Metabolic', isCommon: true },
    { code: 'E11.65', description: 'Type 2 diabetes mellitus with hyperglycemia', category: 'Endocrine & Metabolic', isCommon: true },
    { code: 'E10.9', description: 'Type 1 diabetes mellitus without complications', category: 'Endocrine & Metabolic' },
    { code: 'E03.9', description: 'Hypothyroidism, unspecified', category: 'Endocrine & Metabolic', isCommon: true },
    { code: 'E78.5', description: 'Hyperlipidemia, unspecified', category: 'Endocrine & Metabolic', isCommon: true },
    { code: 'E66.9', description: 'Obesity, unspecified', category: 'Endocrine & Metabolic' },

    // Circulatory System
    { code: 'I10', description: 'Essential (primary) hypertension', category: 'Circulatory System', isCommon: true },
    { code: 'I25.10', description: 'Atherosclerotic heart disease of native coronary artery', category: 'Circulatory System', isCommon: true },
    { code: 'I20.9', description: 'Angina pectoris, unspecified', category: 'Circulatory System' },
    { code: 'I50.9', description: 'Heart failure, unspecified', category: 'Circulatory System', isCommon: true },
    { code: 'I48.91', description: 'Unspecified atrial fibrillation', category: 'Circulatory System' },
    { code: 'I63.9', description: 'Cerebral infarction, unspecified (Stroke)', category: 'Circulatory System' },

    // Respiratory System
    { code: 'J06.9', description: 'Acute upper respiratory infection, unspecified', category: 'Respiratory System', isCommon: true },
    { code: 'J45.909', description: 'Unspecified asthma, uncomplicated', category: 'Respiratory System', isCommon: true },
    { code: 'J44.9', description: 'Chronic obstructive pulmonary disease (COPD), unspecified', category: 'Respiratory System', isCommon: true },
    { code: 'J18.9', description: 'Pneumonia, unspecified organism', category: 'Respiratory System', isCommon: true },
    { code: 'J02.9', description: 'Acute pharyngitis, unspecified', category: 'Respiratory System', isCommon: true },
    { code: 'J01.90', description: 'Acute sinusitis, unspecified', category: 'Respiratory System' },

    // Infectious & Parasitic Diseases
    { code: 'A09', description: 'Infectious gastroenteritis and colitis, unspecified', category: 'Infectious Diseases', isCommon: true },
    { code: 'A01.0', description: 'Typhoid fever', category: 'Infectious Diseases', isCommon: true },
    { code: 'B34.9', description: 'Viral infection, unspecified', category: 'Infectious Diseases', isCommon: true },
    { code: 'B54', description: 'Unspecified malaria', category: 'Infectious Diseases' },
    { code: 'B20', description: 'Human immunodeficiency virus [HIV] disease', category: 'Infectious Diseases' },
    { code: 'A15.0', description: 'Tuberculosis of lung', category: 'Infectious Diseases' },

    // Digestive System
    { code: 'K21.9', description: 'Gastro-esophageal reflux disease without esophagitis (GERD)', category: 'Digestive System', isCommon: true },
    { code: 'K29.70', description: 'Gastritis, unspecified, without bleeding', category: 'Digestive System', isCommon: true },
    { code: 'K35.80', description: 'Unspecified acute appendicitis', category: 'Digestive System' },
    { code: 'K80.20', description: 'Calculus of gallbladder without cholecystitis (Gallstones)', category: 'Digestive System' },
    { code: 'K58.9', description: 'Irritable bowel syndrome without diarrhea', category: 'Digestive System' },

    // Musculoskeletal System
    { code: 'M54.5', description: 'Low back pain', category: 'Musculoskeletal', isCommon: true },
    { code: 'M17.9', description: 'Osteoarthritis of knee, unspecified', category: 'Musculoskeletal', isCommon: true },
    { code: 'M25.50', description: 'Pain in unspecified joint', category: 'Musculoskeletal', isCommon: true },
    { code: 'M79.1', description: 'Myalgia', category: 'Musculoskeletal' },

    // Genitourinary System
    { code: 'N39.0', description: 'Urinary tract infection, site not specified (UTI)', category: 'Genitourinary', isCommon: true },
    { code: 'N20.1', description: 'Calculus of ureter (Kidney stones)', category: 'Genitourinary', isCommon: true },
    { code: 'N18.9', description: 'Chronic kidney disease, unspecified', category: 'Genitourinary' },

    // Symptoms, Signs & Abnormal Clinical Findings
    { code: 'R05', description: 'Cough', category: 'Symptoms & Findings', isCommon: true },
    { code: 'R50.9', description: 'Fever, unspecified', category: 'Symptoms & Findings', isCommon: true },
    { code: 'R51', description: 'Headache', category: 'Symptoms & Findings', isCommon: true },
    { code: 'R07.9', description: 'Chest pain, unspecified', category: 'Symptoms & Findings', isCommon: true },
    { code: 'R10.9', description: 'Abdominal pain, unspecified', category: 'Symptoms & Findings', isCommon: true },
    { code: 'R53.83', description: 'Other fatigue', category: 'Symptoms & Findings' },
  ];

  /**
   * Searches the ICD-10 clinical dictionary by code or description.
   * Matches prefix, code exact, or description substring.
   */
  search(query?: string, limit = 20): Icd10Entry[] {
    if (!query || !query.trim()) {
      return this.icd10Codes.filter((c) => c.isCommon).slice(0, limit);
    }

    const q = query.trim().toLowerCase();
    const results = this.icd10Codes.filter((item) => {
      const codeMatch = item.code.toLowerCase().includes(q);
      const descMatch = item.description.toLowerCase().includes(q);
      const catMatch = item.category.toLowerCase().includes(q);
      return codeMatch || descMatch || catMatch;
    });

    // Sort exact prefix matches first
    results.sort((a, b) => {
      const aStarts = a.code.toLowerCase().startsWith(q) || a.description.toLowerCase().startsWith(q);
      const bStarts = b.code.toLowerCase().startsWith(q) || b.description.toLowerCase().startsWith(q);
      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return 0;
    });

    return results.slice(0, Math.min(100, Math.max(1, limit)));
  }

  /**
   * Looks up a single ICD-10 code.
   */
  findByCode(code: string): Icd10Entry | null {
    if (!code) return null;
    const normalized = code.trim().toUpperCase();
    return this.icd10Codes.find((c) => c.code.toUpperCase() === normalized) || null;
  }
}
