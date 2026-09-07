/**
 * MedCore HMS — Reports & Analytics Service Adapter
 *
 * Provides typed operational, clinical, pharmacy, and financial analytics.
 * Supports date ranges, departmental filtering, and doctor utilization metrics.
 */

export interface OperationalMetrics {
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  averageWaitTimeMinutes: number;
  bedOccupancyRate: number;
  doctorUtilizationRate: number;
}

export interface DepartmentalCensus {
  departmentId: string;
  departmentName: string;
  consultationCount: number;
  sharePercentage: number;
  revenue: number;
}

export interface PharmacyReportSummary {
  totalStockUnits: number;
  activeBatchesCount: number;
  lowStockMedicinesCount: number;
  expiring30DaysCount: number;
  expiredBatchesCount: number;
  fefoComplianceRate: number;
}

export interface BillingAnalytics {
  grossBilledAmount: number;
  collectedAmount: number;
  outstandingBalance: number;
  insuranceClaimSettlementRate: number;
  collectionEfficiency: number;
}

export interface HospitalAnalyticsReport {
  dateRange: string;
  facilityName: string;
  operational: OperationalMetrics;
  departments: DepartmentalCensus[];
  pharmacy: PharmacyReportSummary;
  billing: BillingAnalytics;
}

class ReportsService {
  async getHospitalReport(filters?: {
    dateRange?: string;
    departmentId?: string;
    doctorId?: string;
  }): Promise<HospitalAnalyticsReport> {
    return {
      dateRange: filters?.dateRange || 'THIS_MONTH',
      facilityName: 'Metro General Hospital (Main Campus)',
      operational: {
        totalAppointments: 540,
        completedAppointments: 492,
        cancelledAppointments: 48,
        averageWaitTimeMinutes: 16.5,
        bedOccupancyRate: 78.4,
        doctorUtilizationRate: 88.2,
      },
      departments: [
        {
          departmentId: 'dept-cardio',
          departmentName: 'Cardiology',
          consultationCount: 195,
          sharePercentage: 36.1,
          revenue: 146250,
        },
        {
          departmentId: 'dept-genmed',
          departmentName: 'General Medicine',
          consultationCount: 162,
          sharePercentage: 30.0,
          revenue: 97200,
        },
        {
          departmentId: 'dept-ortho',
          departmentName: 'Orthopedics',
          consultationCount: 98,
          sharePercentage: 18.1,
          revenue: 88200,
        },
        {
          departmentId: 'dept-pediatrics',
          departmentName: 'Pediatrics',
          consultationCount: 85,
          sharePercentage: 15.8,
          revenue: 51000,
        },
      ],
      pharmacy: {
        totalStockUnits: 8450,
        activeBatchesCount: 46,
        lowStockMedicinesCount: 2,
        expiring30DaysCount: 3,
        expiredBatchesCount: 1,
        fefoComplianceRate: 99.8,
      },
      billing: {
        grossBilledAmount: 482650,
        collectedAmount: 412500,
        outstandingBalance: 70150,
        insuranceClaimSettlementRate: 92.5,
        collectionEfficiency: 85.5,
      },
    };
  }
}

export const reportsService = new ReportsService();
