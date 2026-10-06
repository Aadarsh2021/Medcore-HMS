import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { FinancialCalculator } from '../billing/financial-calculator';

export interface HospitalAnalyticsData {
  hospitalId: string;
  facilityName: string;
  generatedAt: string;
  operational: {
    totalAppointments: number;
    completedAppointments: number;
    cancelledAppointments: number;
    completionRate: number;
    totalPatients: number;
    totalBeds: number;
    occupiedBeds: number;
    bedOccupancyRate: number;
  };
  departments: Array<{
    departmentId: string;
    departmentName: string;
    consultationCount: number;
    sharePercentage: number;
    revenue: number;
  }>;
  pharmacy: {
    totalStockUnits: number;
    activeBatchesCount: number;
    lowStockMedicinesCount: number;
    expiring30DaysCount: number;
  };
  billing: {
    grossBilledAmount: number;
    collectedAmount: number;
    outstandingBalance: number;
    collectionEfficiency: number;
  };
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates comprehensive analytics for a hospital tenant.
   */
  async getHospitalAnalytics(hospitalId: string): Promise<HospitalAnalyticsData> {
    const hospital = await this.prisma.raw.hospital.findUnique({
      where: { id: hospitalId },
      select: { id: true, name: true },
    });

    if (!hospital) {
      throw new NotFoundException(`Hospital with ID '${hospitalId}' not found`);
    }

    // 1. Operational & Clinical Metrics
    const [
      totalAppointments,
      completedAppointments,
      cancelledAppointments,
      totalPatients,
      totalBeds,
      occupiedBeds,
    ] = await Promise.all([
      this.prisma.raw.appointment.count({ where: { hospitalId } }),
      this.prisma.raw.appointment.count({ where: { hospitalId, status: 'COMPLETED' as any } }),
      this.prisma.raw.appointment.count({ where: { hospitalId, status: 'CANCELLED' as any } }),
      this.prisma.raw.patient.count({ where: { hospitalId } }),
      this.prisma.raw.bed.count({ where: { hospitalId } }),
      this.prisma.raw.bed.count({ where: { hospitalId, status: 'OCCUPIED' as any } }),
    ]);

    const completionRate =
      totalAppointments > 0
        ? Math.round((completedAppointments / totalAppointments) * 1000) / 10
        : 0;

    const bedOccupancyRate =
      totalBeds > 0
        ? Math.round((occupiedBeds / totalBeds) * 1000) / 10
        : 0;

    // 2. Department Breakdown
    const departments = await this.prisma.raw.department.findMany({
      where: { hospitalId, isActive: true },
      include: {
        appointments: {
          select: {
            id: true,
            status: true,
            invoice: { select: { totalAmount: true } },
          },
        },
      },
    });

    const deptMetrics = departments.map((dept) => {
      const consultationCount = dept.appointments.length;
      let revenue = 0;
      for (const appt of dept.appointments) {
        if (appt.invoice?.totalAmount) {
          revenue += FinancialCalculator.toNumber(appt.invoice.totalAmount);
        }
      }
      return {
        departmentId: dept.id,
        departmentName: dept.name,
        consultationCount,
        sharePercentage:
          totalAppointments > 0
            ? Math.round((consultationCount / totalAppointments) * 1000) / 10
            : 0,
        revenue: FinancialCalculator.round2(revenue),
      };
    });

    // 3. Pharmacy Inventory Summary
    const now = new Date();
    const thirtyDaysFromNow = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const [activeBatches, expiringBatches, medicines] = await Promise.all([
      this.prisma.raw.medicineBatch.findMany({
        where: { hospitalId, currentQuantity: { gt: 0 }, isQuarantined: false },
        select: { currentQuantity: true },
      }),
      this.prisma.raw.medicineBatch.count({
        where: {
          hospitalId,
          expiryDate: { gte: now, lte: thirtyDaysFromNow },
          currentQuantity: { gt: 0 },
        },
      }),
      (this.prisma.raw.medicine as any).findMany({
        where: { hospitalId },
        include: {
          batches: {
            where: { currentQuantity: { gt: 0 }, isQuarantined: false },
            select: { currentQuantity: true },
          },
        },
      }),
    ]);

    let totalStockUnits = 0;
    for (const b of activeBatches) {
      totalStockUnits += b.currentQuantity;
    }

    let lowStockMedicinesCount = 0;
    for (const med of (medicines as any[])) {
      const stock = med.batches?.reduce((sum: number, b: any) => sum + b.currentQuantity, 0) || 0;
      if (stock <= med.reorderLevel) {
        lowStockMedicinesCount++;
      }
    }

    // 4. Financial & Billing Analytics
    const invoices = await this.prisma.raw.invoice.findMany({
      where: { hospitalId, status: { not: 'VOID' as any } },
      select: { totalAmount: true, paidAmount: true },
    });

    let grossBilledAmount = 0;
    let collectedAmount = 0;
    for (const inv of invoices) {
      grossBilledAmount += FinancialCalculator.toNumber(inv.totalAmount);
      collectedAmount += FinancialCalculator.toNumber(inv.paidAmount);
    }
    grossBilledAmount = FinancialCalculator.round2(grossBilledAmount);
    collectedAmount = FinancialCalculator.round2(collectedAmount);
    const outstandingBalance = Math.max(0, FinancialCalculator.round2(grossBilledAmount - collectedAmount));
    const collectionEfficiency =
      grossBilledAmount > 0
        ? Math.round((collectedAmount / grossBilledAmount) * 1000) / 10
        : 0;

    return {
      hospitalId,
      facilityName: hospital.name,
      generatedAt: new Date().toISOString(),
      operational: {
        totalAppointments,
        completedAppointments,
        cancelledAppointments,
        completionRate,
        totalPatients,
        totalBeds,
        occupiedBeds,
        bedOccupancyRate,
      },
      departments: deptMetrics,
      pharmacy: {
        totalStockUnits,
        activeBatchesCount: activeBatches.length,
        lowStockMedicinesCount,
        expiring30DaysCount: expiringBatches,
      },
      billing: {
        grossBilledAmount,
        collectedAmount,
        outstandingBalance,
        collectionEfficiency,
      },
    };
  }

  /**
   * Super Admin Overview: System-wide aggregated metrics across all active hospital tenants.
   */
  async getSystemOverview() {
    const [hospitalsCount, totalUsers, totalPatients, totalInvoices] = await Promise.all([
      this.prisma.raw.hospital.count({ where: { status: 'ACTIVE' } }),
      this.prisma.raw.user.count({ where: { isActive: true } }),
      this.prisma.raw.patient.count(),
      this.prisma.raw.invoice.findMany({
        where: { status: { not: 'VOID' as any } },
        select: { totalAmount: true, paidAmount: true },
      }),
    ]);

    let systemGross = 0;
    let systemCollected = 0;
    for (const inv of totalInvoices) {
      systemGross += FinancialCalculator.toNumber(inv.totalAmount);
      systemCollected += FinancialCalculator.toNumber(inv.paidAmount);
    }

    return {
      totalHospitals: hospitalsCount,
      totalUsers,
      totalPatients,
      financials: {
        grossBilled: FinancialCalculator.round2(systemGross),
        totalCollected: FinancialCalculator.round2(systemCollected),
        outstanding: Math.max(0, FinancialCalculator.round2(systemGross - systemCollected)),
      },
    };
  }
}
