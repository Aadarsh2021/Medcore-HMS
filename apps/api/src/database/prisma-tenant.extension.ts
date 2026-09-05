import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getTenantContext } from './tenant-context';

/**
 * Direct tenant models contain a direct `hospitalId` foreign key.
 */
export const DIRECT_TENANT_MODELS = [
  'Patient',
  'Doctor',
  'Department',
  'Appointment',
  'PatientEncounter',
  'MedicalRecord',
  'Prescription',
  'Medicine',
  'LabCategory',
  'LabTest',
  'LabOrder',
  'Invoice',
  'Payment',
] as const;

/**
 * Indirect tenant models inherit tenancy via their parent relation.
 */
export const INDIRECT_TENANT_MODELS: Record<
  string,
  { relation: string; parentIdField: string; parentModel: string }
> = {
  DoctorAvailability: {
    relation: 'doctor',
    parentIdField: 'doctorId',
    parentModel: 'Doctor',
  },
  DoctorLeave: {
    relation: 'doctor',
    parentIdField: 'doctorId',
    parentModel: 'Doctor',
  },
  Vital: {
    relation: 'record',
    parentIdField: 'recordId',
    parentModel: 'MedicalRecord',
  },
  Diagnosis: {
    relation: 'record',
    parentIdField: 'recordId',
    parentModel: 'MedicalRecord',
  },
  Allergy: {
    relation: 'patient',
    parentIdField: 'patientId',
    parentModel: 'Patient',
  },
  Attachment: {
    relation: 'record',
    parentIdField: 'recordId',
    parentModel: 'MedicalRecord',
  },
  PrescriptionItem: {
    relation: 'prescription',
    parentIdField: 'prescriptionId',
    parentModel: 'Prescription',
  },
  MedicineBatch: {
    relation: 'medicine',
    parentIdField: 'medicineId',
    parentModel: 'Medicine',
  },
  LabOrderItem: {
    relation: 'order',
    parentIdField: 'orderId',
    parentModel: 'LabOrder',
  },
  InvoiceItem: {
    relation: 'invoice',
    parentIdField: 'invoiceId',
    parentModel: 'Invoice',
  },
  RefreshSession: {
    relation: 'user',
    parentIdField: 'userId',
    parentModel: 'User',
  },
};

/**
 * Foreign key references for direct tenant models that must be validated
 * to belong to the active hospital facility upon creation/update.
 */
export const RELATION_TENANT_CONSTRAINTS: Record<
  string,
  Array<{ field: string; parentModel: string }>
> = {
  Appointment: [
    { field: 'patientId', parentModel: 'Patient' },
    { field: 'doctorId', parentModel: 'Doctor' },
    { field: 'departmentId', parentModel: 'Department' },
  ],
  PatientEncounter: [
    { field: 'patientId', parentModel: 'Patient' },
    { field: 'doctorId', parentModel: 'Doctor' },
    { field: 'appointmentId', parentModel: 'Appointment' },
  ],
  MedicalRecord: [
    { field: 'patientId', parentModel: 'Patient' },
    { field: 'doctorId', parentModel: 'Doctor' },
    { field: 'encounterId', parentModel: 'PatientEncounter' },
  ],
  Prescription: [
    { field: 'patientId', parentModel: 'Patient' },
    { field: 'doctorId', parentModel: 'Doctor' },
    { field: 'encounterId', parentModel: 'PatientEncounter' },
  ],
  PrescriptionItem: [
    { field: 'prescriptionId', parentModel: 'Prescription' },
    { field: 'medicineId', parentModel: 'Medicine' },
  ],
  MedicineBatch: [{ field: 'medicineId', parentModel: 'Medicine' }],
  LabOrder: [
    { field: 'patientId', parentModel: 'Patient' },
    { field: 'doctorId', parentModel: 'Doctor' },
    { field: 'encounterId', parentModel: 'PatientEncounter' },
  ],
  LabOrderItem: [
    { field: 'orderId', parentModel: 'LabOrder' },
    { field: 'testId', parentModel: 'LabTest' },
  ],
  Invoice: [
    { field: 'patientId', parentModel: 'Patient' },
    { field: 'appointmentId', parentModel: 'Appointment' },
    { field: 'encounterId', parentModel: 'PatientEncounter' },
  ],
  InvoiceItem: [{ field: 'invoiceId', parentModel: 'Invoice' }],
  Payment: [{ field: 'invoiceId', parentModel: 'Invoice' }],
  Vital: [{ field: 'recordId', parentModel: 'MedicalRecord' }],
  Diagnosis: [{ field: 'recordId', parentModel: 'MedicalRecord' }],
  Allergy: [{ field: 'patientId', parentModel: 'Patient' }],
  Attachment: [{ field: 'recordId', parentModel: 'MedicalRecord' }],
};

/**
 * Converts PascalCase model name to camelCase property name on PrismaClient.
 */
function toClientProp(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

/**
 * Creates the production-grade Prisma tenant isolation extension.
 * Ensures all read and write queries automatically include and validate
 * tenant ownership.
 */
export function createTenantExtension(rawClient: PrismaClient) {
  return {
    name: 'medcore-tenant-isolation',
    query: {
      $allModels: {
        async $allOperations({
          model,
          operation,
          args,
          query,
        }: {
          model: string;
          operation: string;
          args: any;
          query: (args: any) => Promise<any>;
        }) {
          const tenantContext = getTenantContext();

          // If explicitly running in system bypass mode or unauthenticated public context, proceed
          if (tenantContext?.bypassTenant) {
            return query(args);
          }

          const effectiveTenantId = tenantContext?.tenantId;
          const isDirect = (DIRECT_TENANT_MODELS as readonly string[]).includes(model);
          const indirectConfig = INDIRECT_TENANT_MODELS[model];

          // If no tenant context is bound (e.g. unconstrained super admin or public lookup)
          if (!effectiveTenantId) {
            // If super admin attempts a tenant-scoped write operation without specifying target hospital
            if (
              tenantContext?.isSuperAdmin &&
              (isDirect || indirectConfig) &&
              ['create', 'createMany', 'update', 'updateMany', 'delete', 'deleteMany', 'upsert'].includes(operation)
            ) {
              throw new ForbiddenException(
                `Tenant context required: Super Admin must specify target hospital via X-Hospital-Id header to modify ${model} records.`,
              );
            }
            return query(args);
          }

          const clientProp = toClientProp(model);

          // --------------------------------------------------------------------------
          // 1. READ OPERATIONS: findMany, findFirst, count, aggregate, groupBy
          // --------------------------------------------------------------------------
          if (
            ['findMany', 'findFirst', 'count', 'aggregate', 'groupBy'].includes(
              operation,
            )
          ) {
            if (isDirect) {
              // Reject conflicting tenant in query filter
              if (
                args?.where?.hospitalId &&
                args.where.hospitalId !== effectiveTenantId
              ) {
                throw new ForbiddenException(
                  `Cross-tenant query violation: Attempted to query ${model} belonging to another hospital facility.`,
                );
              }
              args = {
                ...args,
                where: {
                  ...args?.where,
                  hospitalId: effectiveTenantId,
                },
              };
            } else if (indirectConfig) {
              args = {
                ...args,
                where: {
                  ...args?.where,
                  [indirectConfig.relation]: {
                    ...args?.where?.[indirectConfig.relation],
                    hospitalId: effectiveTenantId,
                  },
                },
              };
            } else if (model === 'User') {
              // User model tenant scoping when queried in hospital context
              if (
                args?.where?.hospitalId &&
                args.where.hospitalId !== effectiveTenantId
              ) {
                throw new ForbiddenException(
                  `Cross-tenant query violation: Attempted to query Users belonging to another hospital facility.`,
                );
              }
              args = {
                ...args,
                where: {
                  ...args?.where,
                  hospitalId: effectiveTenantId,
                },
              };
            } else if (model === 'Notification' || model === 'AuditLog') {
              // Filter by hospitalId if requested in tenant context
              if (args?.where && !args.where.hospitalId) {
                args = {
                  ...args,
                  where: {
                    ...args.where,
                    hospitalId: effectiveTenantId,
                  },
                };
              }
            }
            return query(args);
          }

          // --------------------------------------------------------------------------
          // 2. READ OPERATIONS: findUnique, findUniqueOrThrow
          // In Prisma, findUnique does not permit non-unique fields in where clause.
          // For tenant isolation, we safely route to findFirst with tenant filter.
          // --------------------------------------------------------------------------
          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            if (isDirect) {
              const result = await (rawClient as any)[clientProp].findFirst({
                ...args,
                where: {
                  ...args?.where,
                  hospitalId: effectiveTenantId,
                },
              });
              if (!result && operation === 'findUniqueOrThrow') {
                throw new NotFoundException(
                  `${model} record not found or access denied for active hospital facility.`,
                );
              }
              return result;
            }

            if (indirectConfig) {
              const result = await (rawClient as any)[clientProp].findFirst({
                ...args,
                where: {
                  ...args?.where,
                  [indirectConfig.relation]: {
                    ...args?.where?.[indirectConfig.relation],
                    hospitalId: effectiveTenantId,
                  },
                },
              });
              if (!result && operation === 'findUniqueOrThrow') {
                throw new NotFoundException(
                  `${model} record not found or access denied for active hospital facility.`,
                );
              }
              return result;
            }

            return query(args);
          }

          // --------------------------------------------------------------------------
          // 3. WRITE OPERATIONS: create
          // --------------------------------------------------------------------------
          if (operation === 'create') {
            if (isDirect) {
              // Validate hospitalId
              if (
                args?.data?.hospitalId &&
                args.data.hospitalId !== effectiveTenantId
              ) {
                throw new ForbiddenException(
                  `Cross-tenant mutation violation: Cannot create ${model} for a different hospital facility (${args.data.hospitalId}).`,
                );
              }
              args.data = {
                ...args.data,
                hospitalId: effectiveTenantId,
              };

              // Validate foreign key relations
              const constraints = RELATION_TENANT_CONSTRAINTS[model] || [];
              for (const { field, parentModel } of constraints) {
                const parentId = args.data[field];
                if (parentId) {
                  const parentProp = toClientProp(parentModel);
                  const parentRecord = await (rawClient as any)[
                    parentProp
                  ].findFirst({
                    where: {
                      id: parentId,
                      hospitalId: effectiveTenantId,
                    },
                    select: { id: true },
                  });
                  if (!parentRecord) {
                    throw new ForbiddenException(
                      `Cross-tenant relation violation: Referenced ${parentModel} (${field}: ${parentId}) does not belong to the active hospital facility.`,
                    );
                  }
                }
              }
            } else if (indirectConfig) {
              // Verify parent entity belongs to active tenant
              const parentId = args.data?.[indirectConfig.parentIdField];
              if (parentId) {
                const parentProp = toClientProp(indirectConfig.parentModel);
                const parentRecord = await (rawClient as any)[
                  parentProp
                ].findFirst({
                  where: {
                    id: parentId,
                    hospitalId: effectiveTenantId,
                  },
                  select: { id: true },
                });
                if (!parentRecord) {
                  throw new ForbiddenException(
                    `Cross-tenant relation violation: Parent ${indirectConfig.parentModel} (${indirectConfig.parentIdField}: ${parentId}) does not belong to active hospital facility.`,
                  );
                }
              }
            }

            return query(args);
          }

          // --------------------------------------------------------------------------
          // 4. WRITE OPERATIONS: createMany
          // --------------------------------------------------------------------------
          if (operation === 'createMany') {
            if (isDirect && Array.isArray(args?.data)) {
              for (const item of args.data) {
                if (item.hospitalId && item.hospitalId !== effectiveTenantId) {
                  throw new ForbiddenException(
                    `Cross-tenant mutation violation: Batch insert contains record belonging to different hospital facility.`,
                  );
                }
                item.hospitalId = effectiveTenantId;
              }
            }
            return query(args);
          }

          // --------------------------------------------------------------------------
          // 5. WRITE OPERATIONS: update
          // --------------------------------------------------------------------------
          if (operation === 'update') {
            if (isDirect) {
              // Verify target record belongs to effective tenant
              const existing = await (rawClient as any)[clientProp].findFirst({
                where: {
                  ...args?.where,
                  hospitalId: effectiveTenantId,
                },
                select: { id: true, hospitalId: true },
              });
              if (!existing) {
                throw new ForbiddenException(
                  `Cross-tenant mutation violation: Cannot update ${model} belonging to another hospital facility or record does not exist.`,
                );
              }

              // Prevent changing hospitalId to another hospital
              if (
                args?.data?.hospitalId &&
                args.data.hospitalId !== effectiveTenantId
              ) {
                throw new ForbiddenException(
                  `Cross-tenant mutation violation: Cannot transfer ${model} to another hospital facility.`,
                );
              }
            } else if (indirectConfig) {
              const existing = await (rawClient as any)[clientProp].findFirst({
                where: {
                  ...args?.where,
                  [indirectConfig.relation]: {
                    hospitalId: effectiveTenantId,
                  },
                },
                select: { id: true },
              });
              if (!existing) {
                throw new ForbiddenException(
                  `Cross-tenant mutation violation: Cannot update ${model} belonging to another hospital facility or record does not exist.`,
                );
              }
            }

            return query(args);
          }

          // --------------------------------------------------------------------------
          // 6. WRITE OPERATIONS: updateMany
          // --------------------------------------------------------------------------
          if (operation === 'updateMany') {
            if (isDirect) {
              if (
                args?.data?.hospitalId &&
                args.data.hospitalId !== effectiveTenantId
              ) {
                throw new ForbiddenException(
                  `Cross-tenant mutation violation: Cannot transfer records to another hospital facility.`,
                );
              }
              args = {
                ...args,
                where: {
                  ...args?.where,
                  hospitalId: effectiveTenantId,
                },
              };
            } else if (indirectConfig) {
              args = {
                ...args,
                where: {
                  ...args?.where,
                  [indirectConfig.relation]: {
                    ...args?.where?.[indirectConfig.relation],
                    hospitalId: effectiveTenantId,
                  },
                },
              };
            }
            return query(args);
          }

          // --------------------------------------------------------------------------
          // 7. WRITE OPERATIONS: delete
          // --------------------------------------------------------------------------
          if (operation === 'delete') {
            if (isDirect) {
              const existing = await (rawClient as any)[clientProp].findFirst({
                where: {
                  ...args?.where,
                  hospitalId: effectiveTenantId,
                },
                select: { id: true },
              });
              if (!existing) {
                throw new ForbiddenException(
                  `Cross-tenant mutation violation: Cannot delete ${model} belonging to another hospital facility or record does not exist.`,
                );
              }
            } else if (indirectConfig) {
              const existing = await (rawClient as any)[clientProp].findFirst({
                where: {
                  ...args?.where,
                  [indirectConfig.relation]: {
                    hospitalId: effectiveTenantId,
                  },
                },
                select: { id: true },
              });
              if (!existing) {
                throw new ForbiddenException(
                  `Cross-tenant mutation violation: Cannot delete ${model} belonging to another hospital facility or record does not exist.`,
                );
              }
            }

            return query(args);
          }

          // --------------------------------------------------------------------------
          // 8. WRITE OPERATIONS: deleteMany
          // --------------------------------------------------------------------------
          if (operation === 'deleteMany') {
            if (isDirect) {
              args = {
                ...args,
                where: {
                  ...args?.where,
                  hospitalId: effectiveTenantId,
                },
              };
            } else if (indirectConfig) {
              args = {
                ...args,
                where: {
                  ...args?.where,
                  [indirectConfig.relation]: {
                    ...args?.where?.[indirectConfig.relation],
                    hospitalId: effectiveTenantId,
                  },
                },
              };
            }
            return query(args);
          }

          // --------------------------------------------------------------------------
          // 9. WRITE OPERATIONS: upsert
          // --------------------------------------------------------------------------
          if (operation === 'upsert') {
            if (isDirect) {
              if (
                args?.create?.hospitalId &&
                args.create.hospitalId !== effectiveTenantId
              ) {
                throw new ForbiddenException(
                  `Cross-tenant mutation violation: Cannot upsert ${model} for a different hospital facility.`,
                );
              }
              args.create = {
                ...args.create,
                hospitalId: effectiveTenantId,
              };

              if (
                args?.update?.hospitalId &&
                args.update.hospitalId !== effectiveTenantId
              ) {
                throw new ForbiddenException(
                  `Cross-tenant mutation violation: Cannot transfer ${model} to another hospital facility.`,
                );
              }
            }
            return query(args);
          }

          // Default fallback
          return query(args);
        },
      },
    },
  };
}
