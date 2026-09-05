import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

export interface GeneratePdfParams {
  hospital: {
    id: string;
    name: string;
    code: string;
    phone: string;
    email: string;
  };
  patient: {
    id: string;
    uhid: string;
    fullName: string;
    age?: number | null;
    gender?: string | null;
  };
  doctor: {
    id: string;
    fullName: string;
    specialization: string;
    licenseNumber: string;
    signatureUrl?: string | null;
  };
  prescription: {
    id: string;
    hospitalId: string;
    encounterId: string;
    patientId: string;
    doctorId: string;
    prescriptionNumber: string;
    issuedAt: Date | string;
    notes?: string | null;
  };
  items: Array<{
    id: string;
    medicineName: string;
    form: string;
    strength?: string | null;
    dosage: string;
    frequency: string;
    durationDays: number;
    route: string;
    instructions?: string | null;
    quantity?: number | null;
  }>;
}

export interface GeneratedPdfResult {
  buffer: Buffer;
  sha256: string;
}

@Injectable()
export class PrescriptionPdfService {
  private readonly logger = new Logger(PrescriptionPdfService.name);

  /**
   * Generates a deterministic prescription PDF and calculates its canonical SHA-256 digest.
   */
  async generatePrescriptionPdf(params: GeneratePdfParams): Promise<GeneratedPdfResult> {
    // 1. Calculate deterministic SHA-256 integrity digest over canonical order data
    const canonicalPayload = {
      hospitalId: params.prescription.hospitalId,
      prescriptionNumber: params.prescription.prescriptionNumber,
      encounterId: params.prescription.encounterId,
      patientId: params.prescription.patientId,
      doctorId: params.prescription.doctorId,
      issuedAt: new Date(params.prescription.issuedAt).toISOString(),
      notes: params.prescription.notes ? params.prescription.notes.trim() : null,
      items: params.items.map((i) => ({
        medicineName: i.medicineName.trim(),
        form: i.form,
        strength: i.strength ? i.strength.trim() : null,
        dosage: i.dosage.trim(),
        frequency: i.frequency,
        durationDays: Number(i.durationDays),
        route: i.route.trim(),
        instructions: i.instructions ? i.instructions.trim() : null,
        quantity: i.quantity !== null && i.quantity !== undefined ? Number(i.quantity) : null,
      })),
    };

    const canonicalJson = JSON.stringify(canonicalPayload);
    const sha256 = crypto.createHash('sha256').update(canonicalJson, 'utf8').digest('hex');

    // 2. Render PDF using PDFKit
    const buffer = await this.renderPdfBuffer(params, sha256);

    return { buffer, sha256 };
  }

  private renderPdfBuffer(params: GeneratePdfParams, sha256: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          size: 'A4',
          margin: 40,
          info: {
            Title: `Prescription ${params.prescription.prescriptionNumber}`,
            Author: params.doctor.fullName,
            Subject: 'Clinical Prescription & Medication Order',
            Keywords: 'MedCore, Prescription, EMR',
          },
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        // --- HOSPITAL HEADER ---
        doc.fillColor('#0f172a').fontSize(20).text(params.hospital.name, { align: 'center' });
        doc.fontSize(9).fillColor('#64748b').text(
          `Hospital Code: ${params.hospital.code} | Tel: ${params.hospital.phone} | Email: ${params.hospital.email}`,
          { align: 'center' },
        );
        doc.moveDown(0.5);
        doc.fontSize(11).fillColor('#1e40af').text('CLINICAL PRESCRIPTION / MEDICATION ORDER', {
          align: 'center',
          underline: false,
        });

        // Top horizontal divider
        doc.strokeColor('#cbd5e1').lineWidth(1).moveTo(40, doc.y + 8).lineTo(555, doc.y + 8).stroke();
        doc.moveDown(1);

        // --- PATIENT & DOCTOR TWO-COLUMN BANNER ---
        const metaTop = doc.y;
        
        // Left column: Patient details
        doc.fontSize(10).fillColor('#0f172a');
        doc.text(`Patient Name: ${params.patient.fullName}`, 40, metaTop);
        doc.fillColor('#475569');
        doc.text(`UHID: ${params.patient.uhid}`);
        const ageGender = [
          params.patient.age ? `Age: ${params.patient.age}` : null,
          params.patient.gender ? `Gender: ${params.patient.gender}` : null,
        ].filter(Boolean).join(' | ') || 'N/A';
        doc.text(ageGender);
        const issuedDateStr = new Date(params.prescription.issuedAt).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        doc.text(`Date of Issue: ${issuedDateStr}`);

        // Right column: Doctor & Prescription details
        doc.fillColor('#0f172a');
        doc.text(`Prescribing Doctor: Dr. ${params.doctor.fullName}`, 300, metaTop);
        doc.fillColor('#475569');
        doc.text(`Department: ${params.doctor.specialization}`, 300);
        doc.text(`Medical License No.: ${params.doctor.licenseNumber}`, 300);
        doc.fillColor('#1e40af').text(`Prescription No.: ${params.prescription.prescriptionNumber}`, 300);

        doc.moveDown(1.5);
        // Bottom metadata divider
        doc.strokeColor('#cbd5e1').lineWidth(0.75).moveTo(40, doc.y).lineTo(555, doc.y).stroke();
        doc.moveDown(1);

        // --- RX SYMBOL ---
        doc.fillColor('#1e40af').fontSize(22).text('Rx', 40, doc.y);
        doc.moveDown(0.5);

        // --- MEDICATION ORDER TABLE ---
        const tableTop = doc.y;
        const colX = {
          num: 40,
          name: 65,
          form: 220,
          dosage: 280,
          route: 380,
          duration: 430,
          qty: 485,
        };

        // Table Header
        doc.fontSize(8).fillColor('#475569');
        doc.text('#', colX.num, tableTop);
        doc.text('Medicine & Strength', colX.name, tableTop);
        doc.text('Form', colX.form, tableTop);
        doc.text('Dosage / Freq', colX.dosage, tableTop);
        doc.text('Route', colX.route, tableTop);
        doc.text('Duration', colX.duration, tableTop);
        doc.text('Qty', colX.qty, tableTop);

        doc.strokeColor('#94a3b8').lineWidth(0.5).moveTo(40, doc.y + 4).lineTo(555, doc.y + 4).stroke();
        doc.moveDown(0.7);

        // Table Rows
        let currentY = doc.y;
        params.items.forEach((item, index) => {
          doc.fontSize(9).fillColor('#0f172a');
          doc.text(`${index + 1}.`, colX.num, currentY);
          
          const medLabel = item.strength ? `${item.medicineName} (${item.strength})` : item.medicineName;
          doc.text(medLabel, colX.name, currentY, { width: 150 });
          doc.text(item.form, colX.form, currentY);
          doc.text(`${item.dosage} — ${item.frequency}`, colX.dosage, currentY);
          doc.text(item.route, colX.route, currentY);
          doc.text(`${item.durationDays} days`, colX.duration, currentY);
          doc.text(item.quantity ? `${item.quantity}` : '—', colX.qty, currentY);

          currentY += 16;

          if (item.instructions) {
            doc.fontSize(8).fillColor('#64748b');
            doc.text(`   Instruction: ${item.instructions}`, colX.name, currentY, { width: 450 });
            currentY += 14;
          }

          doc.strokeColor('#f1f5f9').lineWidth(0.5).moveTo(40, currentY).lineTo(555, currentY).stroke();
          currentY += 4;
        });

        doc.y = currentY;
        doc.moveDown(1.5);

        // --- GENERAL CLINICAL ADVICE & NOTES ---
        if (params.prescription.notes) {
          doc.fontSize(9).fillColor('#0f172a').text('Advice / General Instructions:', 40, doc.y, { underline: true });
          doc.fontSize(9).fillColor('#334155').text(params.prescription.notes, 40, doc.y + 4, { width: 515 });
          doc.moveDown(1.5);
        }

        // --- SIGNATURE & CLINICAL SEAL BLOCK ---
        const signTop = Math.max(doc.y + 20, 640);
        doc.strokeColor('#cbd5e1').lineWidth(0.5).moveTo(340, signTop).lineTo(555, signTop).stroke();
        
        doc.fontSize(9).fillColor('#0f172a').text(`Dr. ${params.doctor.fullName}`, 340, signTop + 6);
        doc.fontSize(8).fillColor('#64748b').text(`Reg / License No.: ${params.doctor.licenseNumber}`, 340, signTop + 18);
        doc.text('Electronic/visual doctor signature representation', 340, signTop + 30);

        // --- FOOTER & INTEGRITY HASH ---
        doc.fontSize(7).fillColor('#94a3b8').text(
          `Prescription Integrity SHA-256: ${sha256}`,
          40,
          780,
          { align: 'center' },
        );
        doc.text('This is a verified digital medication order issued through MedCore HMS.', 40, 792, {
          align: 'center',
        });

        doc.end();
      } catch (err) {
        this.logger.error('Failed to generate prescription PDF:', err);
        reject(err);
      }
    });
  }
}
