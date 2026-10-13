import 'dotenv/config';
import { PrismaClient, Role, Gender, BloodGroup, AppointmentStatus, AppointmentType, EncounterStatus, DiagnosisType, AllergySeverity, MedicineForm, PrescriptionFrequency, PrescriptionStatus, LabOrderStatus, LabResultFlag, InvoiceStatus, InvoiceItemType, PaymentMethod, PaymentStatus } from '@prisma/client';
import { RoomType, BedStatus } from '@medcore/types';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting MedCore HMS Realistic Clinical Database Seed ---');

  const saltRounds = 10;
  const defaultPasswordHash = await bcrypt.hash('Password123!', saltRounds);

  // 1. Clean existing tables in reverse dependency order
  console.log('Cleaning existing records...');
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.labOrderItem.deleteMany();
  await prisma.labOrder.deleteMany();
  await prisma.labTest.deleteMany();
  await prisma.labCategory.deleteMany();
  await prisma.prescriptionNumberCounter.deleteMany();
  await prisma.prescriptionItem.deleteMany();
  await (prisma as any).prescriptionDispenseItem?.deleteMany();
  await (prisma as any).prescriptionDispense?.deleteMany();
  await prisma.prescription.deleteMany();
  await (prisma as any).stockReceiptItem?.deleteMany();
  await (prisma as any).stockReceipt?.deleteMany();
  await (prisma as any).stockMovement?.deleteMany();
  await (prisma as any).dispenseNumberCounter?.deleteMany();
  await (prisma as any).stockReceiptNumberCounter?.deleteMany();
  await prisma.medicineBatch.deleteMany();
  await prisma.medicine.deleteMany();
  await (prisma as any).bedAssignment.deleteMany();
  await (prisma as any).bed.deleteMany();
  await (prisma as any).room.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.allergy.deleteMany();
  await prisma.diagnosis.deleteMany();
  await prisma.vital.deleteMany();
  await prisma.medicalRecord.deleteMany();
  await prisma.patientEncounter.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.doctorLeave.deleteMany();
  await prisma.doctorAvailability.deleteMany();
  await prisma.doctor.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.department.deleteMany();
  await prisma.refreshSession.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.deleteMany();
  await prisma.address.deleteMany();

  // 2. Addresses
  console.log('Seeding Addresses...');
  const addrHospital1 = await prisma.address.create({
    data: {
      street: '45 Health Avenue, Medical District',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400012',
      country: 'India',
    },
  });

  const addrHospital2 = await prisma.address.create({
    data: {
      street: '128 Ring Road, Tech Corridor',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560100',
      country: 'India',
    },
  });

  const addrPatient1 = await prisma.address.create({
    data: {
      street: 'Flat 4B, Sunrise Apartments, Bandra West',
      city: 'Mumbai',
      state: 'Maharashtra',
      postalCode: '400050',
      country: 'India',
    },
  });

  const addrPatient2 = await prisma.address.create({
    data: {
      street: '14 Palm Grove, Indiranagar',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560038',
      country: 'India',
    },
  });

  // 3. Hospitals (Tenants)
  console.log('Seeding Hospitals (Tenants)...');
  const hospitalMetro = await prisma.hospital.create({
    data: {
      name: 'Metro General Hospital & Heart Institute',
      slug: 'metro-general',
      code: 'METRO-MUM-01',
      email: 'contact@metrogeneral.org',
      phone: '+91 22 2410 8000',
      website: 'https://metrogeneral.org',
      status: 'ACTIVE',
      subscriptionTier: 'ENTERPRISE',
      addressId: addrHospital1.id,
      settings: {
        workingHours: { start: '08:00', end: '20:00' },
        currency: 'INR',
        taxRate: 5.0,
      },
    },
  });

  const hospitalApex = await prisma.hospital.create({
    data: {
      name: 'Apex Super Speciality Healthcare',
      slug: 'apex-healthcare',
      code: 'APEX-BLR-02',
      email: 'care@apexhealth.org',
      phone: '+91 80 4900 1234',
      website: 'https://apexhealth.org',
      status: 'ACTIVE',
      subscriptionTier: 'STANDARD',
      addressId: addrHospital2.id,
      settings: {
        workingHours: { start: '09:00', end: '19:00' },
        currency: 'INR',
        taxRate: 5.0,
      },
    },
  });

  // 4. Super Admin
  console.log('Seeding Super Admin...');
  await prisma.user.create({
    data: {
      email: 'superadmin@medcore.io',
      passwordHash: defaultPasswordHash,
      role: Role.SUPER_ADMIN,
      firstName: 'Vikram',
      lastName: 'Singhania',
      phone: '+91 98200 11223',
      isEmailVerified: true,
      isPhoneVerified: true,
    },
  });

  // 5. Hospital Admins
  console.log('Seeding Hospital Admins...');
  const userAdminMetro = await prisma.user.create({
    data: {
      hospitalId: hospitalMetro.id,
      email: 'admin.metro@medcore.io',
      passwordHash: defaultPasswordHash,
      role: Role.HOSPITAL_ADMIN,
      firstName: 'Pooja',
      lastName: 'Deshmukh',
      phone: '+91 98201 33445',
      isEmailVerified: true,
    },
  });

  await prisma.user.create({
    data: {
      hospitalId: hospitalApex.id,
      email: 'admin.apex@medcore.io',
      passwordHash: defaultPasswordHash,
      role: Role.HOSPITAL_ADMIN,
      firstName: 'Ramesh',
      lastName: 'Iyer',
      phone: '+91 98450 66778',
      isEmailVerified: true,
    },
  });

  // 6. Departments for Metro General
  console.log('Seeding Departments...');
  const deptCardio = await prisma.department.create({
    data: {
      hospitalId: hospitalMetro.id,
      name: 'Cardiology & Vascular Medicine',
      code: 'CARDIO',
      description: 'Comprehensive adult and pediatric cardiac care, cath lab, and ECG/Echo diagnostics.',
    },
  });

  const deptPeds = await prisma.department.create({
    data: {
      hospitalId: hospitalMetro.id,
      name: 'Pediatrics & Neonatology',
      code: 'PEDS',
      description: 'Specialized healthcare from neonates through adolescents.',
    },
  });

  const deptGeneral = await prisma.department.create({
    data: {
      hospitalId: hospitalMetro.id,
      name: 'Internal & General Medicine',
      code: 'GENMED',
      description: 'Diagnosis and non-surgical treatment of adult diseases and lifestyle disorders.',
    },
  });

  const deptOrtho = await prisma.department.create({
    data: {
      hospitalId: hospitalMetro.id,
      name: 'Orthopedics & Joint Reconstruction',
      code: 'ORTHO',
      description: 'Surgical and non-surgical treatment of musculoskeletal conditions and trauma.',
    },
  });

  const deptNeuro = await prisma.department.create({
    data: {
      hospitalId: hospitalMetro.id,
      name: 'Neurology & Neurosurgery',
      code: 'NEURO',
      description: 'Diagnosis and management of brain, spine, and peripheral nerve disorders.',
    },
  });

  const deptDerma = await prisma.department.create({
    data: {
      hospitalId: hospitalMetro.id,
      name: 'Dermatology & Cosmetology',
      code: 'DERMA',
      description: 'Medical and cosmetic care of skin, hair, and nail conditions.',
    },
  });

  const deptApexGeneral = await prisma.department.create({
    data: {
      hospitalId: hospitalApex.id,
      name: 'General Medicine & Family Practice',
      code: 'APEX-GEN',
      description: 'Primary healthcare and preventive medicine services.',
    },
  });

  const deptApexOrtho = await prisma.department.create({
    data: {
      hospitalId: hospitalApex.id,
      name: 'Orthopedics & Sports Medicine',
      code: 'APEX-ORTHO',
      description: 'Treatment of sports injuries and joint arthroscopy.',
    },
  });

  // 7. Clinicians (Doctors) — PRD requirement: >= 8 doctors across specialisations
  console.log('Seeding Doctors (8 total across specialisations)...');
  const userDocSharma = await prisma.user.create({
    data: {
      hospitalId: hospitalMetro.id,
      email: 'dr.sharma@metrogeneral.org',
      passwordHash: defaultPasswordHash,
      role: Role.DOCTOR,
      firstName: 'Rajesh',
      lastName: 'Sharma',
      phone: '+91 98202 55667',
      isEmailVerified: true,
    },
  });

  const docSharma = await prisma.doctor.create({
    data: {
      userId: userDocSharma.id,
      hospitalId: hospitalMetro.id,
      departmentId: deptCardio.id,
      specialization: 'Interventional Cardiology',
      licenseNumber: 'MCI-2008-04921',
      consultationFee: 800.0,
      bio: 'Senior Consultant Cardiologist with 16+ years experience in CAD management, angiography, and heart failure.',
    },
  });

  const userDocMenon = await prisma.user.create({
    data: {
      hospitalId: hospitalMetro.id,
      email: 'dr.menon@metrogeneral.org',
      passwordHash: defaultPasswordHash,
      role: Role.DOCTOR,
      firstName: 'Ananya',
      lastName: 'Menon',
      phone: '+91 98203 77889',
      isEmailVerified: true,
    },
  });

  const docMenon = await prisma.doctor.create({
    data: {
      userId: userDocMenon.id,
      hospitalId: hospitalMetro.id,
      departmentId: deptGeneral.id,
      specialization: 'Internal Medicine',
      licenseNumber: 'MCI-2012-08143',
      consultationFee: 600.0,
      bio: 'Consultant Physician specializing in diabetic care, hypertension, and infectious diseases.',
    },
  });

  const additionalDoctorDefs = [
    {
      email: 'dr.nair@metrogeneral.org',
      firstName: 'Priya',
      lastName: 'Nair',
      phone: '+91 98203 11122',
      hospitalId: hospitalMetro.id,
      departmentId: deptPeds.id,
      specialization: 'Pediatrics & Neonatology',
      licenseNumber: 'MCI-2014-09923',
      consultationFee: 700.0,
      bio: 'Pediatric specialist with expertise in child development and neonatal intensive care.',
    },
    {
      email: 'dr.kapoor@metrogeneral.org',
      firstName: 'Vikram',
      lastName: 'Kapoor',
      phone: '+91 98203 22233',
      hospitalId: hospitalMetro.id,
      departmentId: deptOrtho.id,
      specialization: 'Orthopedic Surgery & Arthroplasty',
      licenseNumber: 'MCI-2010-06182',
      consultationFee: 900.0,
      bio: 'Joint replacement surgeon specializing in minimally invasive knee and hip replacements.',
    },
    {
      email: 'dr.reddy@metrogeneral.org',
      firstName: 'Sneha',
      lastName: 'Reddy',
      phone: '+91 98203 33344',
      hospitalId: hospitalMetro.id,
      departmentId: deptNeuro.id,
      specialization: 'Neurology & Stroke Care',
      licenseNumber: 'MCI-2015-11204',
      consultationFee: 1000.0,
      bio: 'Consultant Neurologist specializing in acute stroke intervention and epilepsy.',
    },
    {
      email: 'dr.verma@metrogeneral.org',
      firstName: 'Rohan',
      lastName: 'Verma',
      phone: '+91 98203 44455',
      hospitalId: hospitalMetro.id,
      departmentId: deptDerma.id,
      specialization: 'Dermatology & Dermatosurgery',
      licenseNumber: 'MCI-2016-12490',
      consultationFee: 650.0,
      bio: 'Dermatologist with clinical expertise in psoriasis, eczema, and dermatosurgical procedures.',
    },
    {
      email: 'dr.joshi@apexhealth.org',
      firstName: 'Meera',
      lastName: 'Joshi',
      phone: '+91 98450 55566',
      hospitalId: hospitalApex.id,
      departmentId: deptApexGeneral.id,
      specialization: 'Family Medicine & Diabetology',
      licenseNumber: 'KMC-2011-05432',
      consultationFee: 550.0,
      bio: 'Senior consultant in family medicine with deep interest in chronic disease lifestyle management.',
    },
    {
      email: 'dr.saxena@apexhealth.org',
      firstName: 'Arjun',
      lastName: 'Saxena',
      phone: '+91 98450 66677',
      hospitalId: hospitalApex.id,
      departmentId: deptApexOrtho.id,
      specialization: 'Sports Medicine & Arthroscopy',
      licenseNumber: 'KMC-2013-08871',
      consultationFee: 750.0,
      bio: 'Orthopedic surgeon focusing on ACL reconstruction, rotator cuff repair, and sports injury recovery.',
    },
  ];

  const allDoctors = [docSharma, docMenon];

  for (const d of additionalDoctorDefs) {
    const userDoc = await prisma.user.create({
      data: {
        hospitalId: d.hospitalId,
        email: d.email,
        passwordHash: defaultPasswordHash,
        role: Role.DOCTOR,
        firstName: d.firstName,
        lastName: d.lastName,
        phone: d.phone,
        isEmailVerified: true,
      },
    });

    const doc = await prisma.doctor.create({
      data: {
        userId: userDoc.id,
        hospitalId: d.hospitalId,
        departmentId: d.departmentId,
        specialization: d.specialization,
        licenseNumber: d.licenseNumber,
        consultationFee: d.consultationFee,
        bio: d.bio,
      },
    });

    allDoctors.push(doc);
  }

  // Doctor Availability (Mon to Fri: 09:00 - 13:00)
  console.log('Seeding Doctor Schedules for all 8 Doctors...');
  for (const doc of allDoctors) {
    for (let day = 1; day <= 5; day++) {
      await prisma.doctorAvailability.create({
        data: {
          doctorId: doc.id,
          dayOfWeek: day,
          startTime: '09:00',
          endTime: '13:00',
          slotDurationMinutes: 30,
          maxBookingsPerSlot: 1,
        },
      });
    }
  }

  // 8. Hospital Staff (Nurse, Receptionist, Lab Tech, Pharmacist, Accountant)
  console.log('Seeding Hospital Staff...');
  await prisma.user.create({
    data: {
      hospitalId: hospitalMetro.id,
      email: 'nurse.sunita@metrogeneral.org',
      passwordHash: defaultPasswordHash,
      role: Role.NURSE,
      firstName: 'Sunita',
      lastName: 'Rao',
      phone: '+91 98204 11335',
      isEmailVerified: true,
    },
  });

  await prisma.user.create({
    data: {
      hospitalId: hospitalMetro.id,
      email: 'reception.rahul@metrogeneral.org',
      passwordHash: defaultPasswordHash,
      role: Role.RECEPTIONIST,
      firstName: 'Rahul',
      lastName: 'Verma',
      phone: '+91 98205 22446',
      isEmailVerified: true,
    },
  });

  await prisma.user.create({
    data: {
      hospitalId: hospitalMetro.id,
      email: 'lab.tech@metrogeneral.org',
      passwordHash: defaultPasswordHash,
      role: Role.LAB_TECHNICIAN,
      firstName: 'Karthik',
      lastName: 'Nambiar',
      phone: '+91 98206 33557',
      isEmailVerified: true,
    },
  });

  await prisma.user.create({
    data: {
      hospitalId: hospitalMetro.id,
      email: 'pharmacy.priya@metrogeneral.org',
      passwordHash: defaultPasswordHash,
      role: Role.PHARMACIST,
      firstName: 'Priya',
      lastName: 'Joshi',
      phone: '+91 98207 44668',
      isEmailVerified: true,
    },
  });

  await prisma.user.create({
    data: {
      hospitalId: hospitalMetro.id,
      email: 'accounts.amit@metrogeneral.org',
      passwordHash: defaultPasswordHash,
      role: Role.ACCOUNTANT,
      firstName: 'Amit',
      lastName: 'Gupta',
      phone: '+91 98208 55779',
      isEmailVerified: true,
    },
  });

  // 9. Patients
  console.log('Seeding Patients...');
  const userPatient1 = await prisma.user.create({
    data: {
      hospitalId: hospitalMetro.id,
      email: 'patient.arjun@gmail.com',
      passwordHash: defaultPasswordHash,
      role: Role.PATIENT,
      firstName: 'Arjun',
      lastName: 'Mehta',
      phone: '+91 98199 88776',
      isEmailVerified: true,
    },
  });

  const patient1 = await prisma.patient.create({
    data: {
      userId: userPatient1.id,
      hospitalId: hospitalMetro.id,
      uhid: 'METRO-2025-00101',
      dateOfBirth: new Date('1984-06-15'),
      gender: Gender.MALE,
      bloodGroup: BloodGroup.B_POSITIVE,
      addressId: addrPatient1.id,
      emergencyContactName: 'Deepa Mehta',
      emergencyContactPhone: '+91 98199 88777',
      emergencyContactRelation: 'Spouse',
      allergiesSummary: 'Penicillin (Severe urticaria/angioedema)',
    },
  });

  const userPatient2 = await prisma.user.create({
    data: {
      hospitalId: hospitalMetro.id,
      email: 'patient.kavita@gmail.com',
      passwordHash: defaultPasswordHash,
      role: Role.PATIENT,
      firstName: 'Kavita',
      lastName: 'Kulkarni',
      phone: '+91 98199 11223',
      isEmailVerified: true,
    },
  });

  const patient2 = await prisma.patient.create({
    data: {
      userId: userPatient2.id,
      hospitalId: hospitalMetro.id,
      uhid: 'METRO-2025-00102',
      dateOfBirth: new Date('1991-11-20'),
      gender: Gender.FEMALE,
      bloodGroup: BloodGroup.O_POSITIVE,
      addressId: addrPatient2.id,
      emergencyContactName: 'Sanjay Kulkarni',
      emergencyContactPhone: '+91 98199 11224',
      emergencyContactRelation: 'Brother',
      allergiesSummary: 'Sulfa Drugs',
    },
  });

  // PRD requirement: >= 30 patients seeded
  console.log('Seeding 28 Additional Patients (to reach 30 total)...');
  const allPatients = [patient1, patient2];
  const patientDataSeeds = [
    { name: 'Amitabh Sen', gender: Gender.MALE, blood: BloodGroup.A_POSITIVE, dob: '1978-04-12', phone: '+91 98199 00001', allergies: 'Aspirin' },
    { name: 'Sunita Patil', gender: Gender.FEMALE, blood: BloodGroup.B_POSITIVE, dob: '1985-09-25', phone: '+91 98199 00002', allergies: 'None' },
    { name: 'Ravi Teja', gender: Gender.MALE, blood: BloodGroup.O_POSITIVE, dob: '1992-01-18', phone: '+91 98199 00003', allergies: 'Ciprofloxacin' },
    { name: 'Pooja Bhatt', gender: Gender.FEMALE, blood: BloodGroup.AB_POSITIVE, dob: '1990-11-03', phone: '+91 98199 00004', allergies: 'None' },
    { name: 'Devendra Dave', gender: Gender.MALE, blood: BloodGroup.O_NEGATIVE, dob: '1965-07-29', phone: '+91 98199 00005', allergies: 'Latex' },
    { name: 'Ankita Ghosh', gender: Gender.FEMALE, blood: BloodGroup.A_NEGATIVE, dob: '1996-03-14', phone: '+91 98199 00006', allergies: 'Ibuprofen' },
    { name: 'Manish Pandey', gender: Gender.MALE, blood: BloodGroup.B_NEGATIVE, dob: '1988-12-08', phone: '+91 98199 00007', allergies: 'None' },
    { name: 'Shalini Nair', gender: Gender.FEMALE, blood: BloodGroup.B_POSITIVE, dob: '1994-05-22', phone: '+91 98199 00008', allergies: 'Dust mites' },
    { name: 'Kiran More', gender: Gender.MALE, blood: BloodGroup.O_POSITIVE, dob: '1973-10-31', phone: '+91 98199 00009', allergies: 'None' },
    { name: 'Neha Chawla', gender: Gender.FEMALE, blood: BloodGroup.A_POSITIVE, dob: '1998-08-19', phone: '+91 98199 00010', allergies: 'Codeine' },
    { name: 'Gaurav Singhal', gender: Gender.MALE, blood: BloodGroup.AB_NEGATIVE, dob: '1983-02-15', phone: '+91 98199 00011', allergies: 'None' },
    { name: 'Deepika Rao', gender: Gender.FEMALE, blood: BloodGroup.O_POSITIVE, dob: '1991-06-27', phone: '+91 98199 00012', allergies: 'None' },
    { name: 'Siddharth Jain', gender: Gender.MALE, blood: BloodGroup.B_POSITIVE, dob: '1989-09-09', phone: '+91 98199 00013', allergies: 'Paracetamol' },
    { name: 'Meenakshi Iyer', gender: Gender.FEMALE, blood: BloodGroup.A_POSITIVE, dob: '1970-12-01', phone: '+91 98199 00014', allergies: 'None' },
    { name: 'Aditya Roy', gender: Gender.MALE, blood: BloodGroup.O_POSITIVE, dob: '1995-04-17', phone: '+91 98199 00015', allergies: 'None' },
    { name: 'Smriti Mandhana', gender: Gender.FEMALE, blood: BloodGroup.B_POSITIVE, dob: '1996-07-18', phone: '+91 98199 00016', allergies: 'Shellfish' },
    { name: 'Kunal Kapoor', gender: Gender.MALE, blood: BloodGroup.A_NEGATIVE, dob: '1981-11-23', phone: '+91 98199 00017', allergies: 'None' },
    { name: 'Swati Deshmukh', gender: Gender.FEMALE, blood: BloodGroup.O_NEGATIVE, dob: '1987-03-30', phone: '+91 98199 00018', allergies: 'Penicillin' },
    { name: 'Nikhil Chopra', gender: Gender.MALE, blood: BloodGroup.B_POSITIVE, dob: '1979-08-14', phone: '+91 98199 00019', allergies: 'None' },
    { name: 'Tanvi Shinde', gender: Gender.FEMALE, blood: BloodGroup.A_POSITIVE, dob: '2000-02-10', phone: '+91 98199 00020', allergies: 'None' },
    { name: 'Varun Dhawan', gender: Gender.MALE, blood: BloodGroup.AB_POSITIVE, dob: '1987-04-24', phone: '+91 98199 00021', allergies: 'Peanuts' },
    { name: 'Ritu Sen', gender: Gender.FEMALE, blood: BloodGroup.O_POSITIVE, dob: '1993-10-15', phone: '+91 98199 00022', allergies: 'None' },
    { name: 'Harish Kalyan', gender: Gender.MALE, blood: BloodGroup.B_POSITIVE, dob: '1984-06-29', phone: '+91 98199 00023', allergies: 'None' },
    { name: 'Ananya Birla', gender: Gender.FEMALE, blood: BloodGroup.A_POSITIVE, dob: '1994-07-17', phone: '+91 98199 00024', allergies: 'None' },
    { name: 'Sanjay Dutt', gender: Gender.MALE, blood: BloodGroup.O_POSITIVE, dob: '1960-07-29', phone: '+91 98199 00025', allergies: 'Morphine' },
    { name: 'Bhavna Pandey', gender: Gender.FEMALE, blood: BloodGroup.B_NEGATIVE, dob: '1975-01-20', phone: '+91 98199 00026', allergies: 'None' },
    { name: 'Chirag Paswan', gender: Gender.MALE, blood: BloodGroup.A_POSITIVE, dob: '1982-10-31', phone: '+91 98199 00027', allergies: 'None' },
    { name: 'Geeta Phogat', gender: Gender.FEMALE, blood: BloodGroup.O_POSITIVE, dob: '1988-12-15', phone: '+91 98199 00028', allergies: 'None' },
  ];

  for (let i = 0; i < patientDataSeeds.length; i++) {
    const item = patientDataSeeds[i];
    const [firstName, ...rest] = item.name.split(' ');
    const lastName = rest.join(' ');
    const uhidNum = (103 + i).toString().padStart(5, '0');
    const uhid = `METRO-2025-${uhidNum}`;
    const email = `patient.${firstName.toLowerCase()}.${i + 3}@medcore.demo`;

    const userP = await prisma.user.create({
      data: {
        hospitalId: hospitalMetro.id,
        email,
        passwordHash: defaultPasswordHash,
        role: Role.PATIENT,
        firstName,
        lastName,
        phone: item.phone,
        isEmailVerified: true,
      },
    });

    const p = await prisma.patient.create({
      data: {
        userId: userP.id,
        hospitalId: hospitalMetro.id,
        uhid,
        dateOfBirth: new Date(item.dob),
        gender: item.gender,
        bloodGroup: item.blood,
        addressId: addrPatient1.id,
        emergencyContactName: `${lastName} Family`,
        emergencyContactPhone: item.phone,
        emergencyContactRelation: 'Family',
        allergiesSummary: item.allergies,
      },
    });
    allPatients.push(p);
  }

  // 10. Pharmacy: Medicines & Batches (FIFO Inventory)
  console.log('Seeding Pharmacy & Batches...');
  const medAmoxicillin = await prisma.medicine.create({
    data: {
      hospitalId: hospitalMetro.id,
      name: 'Amoxicillin + Clavulanic Acid',
      genericName: 'Augmentin 625 Duo',
      category: 'Antibiotics',
      form: MedicineForm.TABLET,
      strength: '625 mg',
      manufacturer: 'GSK Pharma',
      reorderLevel: 50,
    },
  });

  // Batch 1: Expiring in 6 months
  await prisma.medicineBatch.create({
    data: {
      hospitalId: hospitalMetro.id,
      medicineId: medAmoxicillin.id,
      batchNumber: 'AUG-2025-04',
      manufacturingDate: new Date('2024-10-01'),
      expiryDate: new Date('2026-03-31'),
      initialQuantity: 200,
      currentQuantity: 180,
      unitCost: 12.5,
      mrp: 22.0,
    },
  });

  // Batch 2: Expiring in 18 months
  await prisma.medicineBatch.create({
    data: {
      hospitalId: hospitalMetro.id,
      medicineId: medAmoxicillin.id,
      batchNumber: 'AUG-2025-08',
      manufacturingDate: new Date('2025-02-01'),
      expiryDate: new Date('2026-12-31'),
      initialQuantity: 300,
      currentQuantity: 300,
      unitCost: 11.8,
      mrp: 22.0,
    },
  });

  const medAtorvastatin = await prisma.medicine.create({
    data: {
      hospitalId: hospitalMetro.id,
      name: 'Atorvastatin',
      genericName: 'Lipitor 20',
      category: 'Cardiovascular',
      form: MedicineForm.TABLET,
      strength: '20 mg',
      manufacturer: 'Pfizer',
      reorderLevel: 100,
    },
  });

  await prisma.medicineBatch.create({
    data: {
      hospitalId: hospitalMetro.id,
      medicineId: medAtorvastatin.id,
      batchNumber: 'LIP-2025-01',
      manufacturingDate: new Date('2025-01-15'),
      expiryDate: new Date('2027-01-14'),
      initialQuantity: 500,
      currentQuantity: 420,
      unitCost: 8.0,
      mrp: 16.5,
    },
  });

  // 11. Laboratory: Categories & Tests
  console.log('Seeding Laboratory Catalog...');
  const labCatHematology = await prisma.labCategory.create({
    data: {
      hospitalId: hospitalMetro.id,
      name: 'Hematology',
    },
  });

  const labTestCBC = await prisma.labTest.create({
    data: {
      hospitalId: hospitalMetro.id,
      categoryId: labCatHematology.id,
      name: 'Complete Blood Count (CBC) with Differential',
      code: 'CBC-DIFF-01',
      price: 450.0,
      sampleType: 'Whole Blood (EDTA)',
      turnaroundHours: 4,
      referenceRangeMin: 13.0,
      referenceRangeMax: 17.5,
      unit: 'g/dL (Hemoglobin)',
    },
  });

  const labCatBiochem = await prisma.labCategory.create({
    data: {
      hospitalId: hospitalMetro.id,
      name: 'Biochemistry',
    },
  });

  const labTestLipid = await prisma.labTest.create({
    data: {
      hospitalId: hospitalMetro.id,
      categoryId: labCatBiochem.id,
      name: 'Lipid Profile Comprehensive',
      code: 'LIPID-COMP-02',
      price: 750.0,
      sampleType: 'Serum (Fasting)',
      turnaroundHours: 8,
      referenceRangeMin: 0.0,
      referenceRangeMax: 200.0,
      unit: 'mg/dL (Total Cholesterol)',
    },
  });

  // 11.1 Foundational Medicines Catalog (Phase 6)
  console.log('Seeding Foundational Medicines Catalog (Phase 6)...');
  const foundationalMedicines = [
    { name: 'Paracetamol 500mg', genericName: 'Paracetamol', category: 'Analgesic', form: MedicineForm.TABLET, strength: '500 mg', manufacturer: 'Cipla Ltd' },
    { name: 'Paracetamol 650mg', genericName: 'Paracetamol', category: 'Analgesic', form: MedicineForm.TABLET, strength: '650 mg', manufacturer: 'Micro Labs' },
    { name: 'Ibuprofen 400mg', genericName: 'Ibuprofen', category: 'NSAID', form: MedicineForm.TABLET, strength: '400 mg', manufacturer: 'Abbott Healthcare' },
    { name: 'Diclofenac 50mg', genericName: 'Diclofenac Sodium', category: 'NSAID', form: MedicineForm.TABLET, strength: '50 mg', manufacturer: 'Novartis' },
    { name: 'Tramadol 50mg', genericName: 'Tramadol Hydrochloride', category: 'Opioid Analgesic', form: MedicineForm.CAPSULE, strength: '50 mg', manufacturer: 'Sun Pharma' },
    { name: 'Amoxicillin 500mg', genericName: 'Amoxicillin', category: 'Antibiotic', form: MedicineForm.CAPSULE, strength: '500 mg', manufacturer: 'Alkem Laboratories' },
    { name: 'Augmentin 625mg', genericName: 'Amoxicillin + Clavulanic Acid', category: 'Antibiotic', form: MedicineForm.TABLET, strength: '625 mg', manufacturer: 'GSK' },
    { name: 'Azithromycin 500mg', genericName: 'Azithromycin', category: 'Macrolide Antibiotic', form: MedicineForm.TABLET, strength: '500 mg', manufacturer: 'Pfizer' },
    { name: 'Ciprofloxacin 500mg', genericName: 'Ciprofloxacin', category: 'Fluoroquinolone', form: MedicineForm.TABLET, strength: '500 mg', manufacturer: 'Bayer' },
    { name: 'Doxycycline 100mg', genericName: 'Doxycycline', category: 'Tetracycline', form: MedicineForm.CAPSULE, strength: '100 mg', manufacturer: 'USV Pvt Ltd' },
    { name: 'Ceftriaxone 1g Injection', genericName: 'Ceftriaxone', category: 'Cephalosporin', form: MedicineForm.INJECTION, strength: '1 g', manufacturer: 'Aristo Pharmaceuticals' },
    { name: 'Amlodipine 5mg', genericName: 'Amlodipine Besylate', category: 'Calcium Channel Blocker', form: MedicineForm.TABLET, strength: '5 mg', manufacturer: 'Pfizer' },
    { name: 'Telmisartan 40mg', genericName: 'Telmisartan', category: 'ARB Antihypertensive', form: MedicineForm.TABLET, strength: '40 mg', manufacturer: 'Glenmark' },
    { name: 'Losartan 50mg', genericName: 'Losartan Potassium', category: 'ARB Antihypertensive', form: MedicineForm.TABLET, strength: '50 mg', manufacturer: 'Torrent Pharma' },
    { name: 'Atenolol 50mg', genericName: 'Atenolol', category: 'Beta Blocker', form: MedicineForm.TABLET, strength: '50 mg', manufacturer: 'AstraZeneca' },
    { name: 'Atorvastatin 10mg', genericName: 'Atorvastatin', category: 'Lipid Lowering', form: MedicineForm.TABLET, strength: '10 mg', manufacturer: 'Ranbaxy' },
    { name: 'Atorvastatin 20mg', genericName: 'Atorvastatin', category: 'Lipid Lowering', form: MedicineForm.TABLET, strength: '20 mg', manufacturer: 'Sun Pharma' },
    { name: 'Clopidogrel 75mg', genericName: 'Clopidogrel', category: 'Antiplatelet', form: MedicineForm.TABLET, strength: '75 mg', manufacturer: 'Sanofi' },
    { name: 'Metformin 500mg', genericName: 'Metformin Hydrochloride', category: 'Antidiabetic', form: MedicineForm.TABLET, strength: '500 mg', manufacturer: 'USV Pvt Ltd' },
    { name: 'Metformin 1000mg ER', genericName: 'Metformin Hydrochloride', category: 'Antidiabetic', form: MedicineForm.TABLET, strength: '1000 mg', manufacturer: 'USV Pvt Ltd' },
    { name: 'Glimepiride 1mg', genericName: 'Glimepiride', category: 'Sulfonylurea', form: MedicineForm.TABLET, strength: '1 mg', manufacturer: 'Sanofi' },
    { name: 'Glimepiride 2mg', genericName: 'Glimepiride', category: 'Sulfonylurea', form: MedicineForm.TABLET, strength: '2 mg', manufacturer: 'Sanofi' },
    { name: 'Human Actrapid 40IU/ml', genericName: 'Regular Soluble Insulin', category: 'Insulin', form: MedicineForm.INJECTION, strength: '40 IU/ml', manufacturer: 'Novo Nordisk' },
    { name: 'Omeprazole 20mg', genericName: 'Omeprazole', category: 'Proton Pump Inhibitor', form: MedicineForm.CAPSULE, strength: '20 mg', manufacturer: 'Dr. Reddy\'s' },
    { name: 'Pantoprazole 40mg', genericName: 'Pantoprazole', category: 'Proton Pump Inhibitor', form: MedicineForm.TABLET, strength: '40 mg', manufacturer: 'Alkem Laboratories' },
    { name: 'Ranitidine 150mg', genericName: 'Ranitidine', category: 'H2 Blocker', form: MedicineForm.TABLET, strength: '150 mg', manufacturer: 'JB Chemicals' },
    { name: 'Ondansetron 4mg', genericName: 'Ondansetron', category: 'Antiemetic', form: MedicineForm.TABLET, strength: '4 mg', manufacturer: 'GlaxoSmithKline' },
    { name: 'Domperidone 10mg', genericName: 'Domperidone', category: 'Prokinetic Antiemetic', form: MedicineForm.TABLET, strength: '10 mg', manufacturer: 'Torrent Pharma' },
    { name: 'Salbutamol Inhaler 100mcg', genericName: 'Salbutamol', category: 'Bronchodilator', form: MedicineForm.INHALER, strength: '100 mcg/puff', manufacturer: 'Cipla Ltd' },
    { name: 'Budesonide Inhaler 200mcg', genericName: 'Budesonide', category: 'Corticosteroid', form: MedicineForm.INHALER, strength: '200 mcg/puff', manufacturer: 'Cipla Ltd' },
    { name: 'Montelukast 10mg', genericName: 'Montelukast Sodium', category: 'Leukotriene Antagonist', form: MedicineForm.TABLET, strength: '10 mg', manufacturer: 'Sun Pharma' },
    { name: 'Cetirizine 10mg', genericName: 'Cetirizine Hydrochloride', category: 'Antihistamine', form: MedicineForm.TABLET, strength: '10 mg', manufacturer: 'Dr. Reddy\'s' },
    { name: 'Levocetirizine 5mg', genericName: 'Levocetirizine', category: 'Antihistamine', form: MedicineForm.TABLET, strength: '5 mg', manufacturer: 'Hetero Healthcare' },
    { name: 'Becosules Z Multivitamin', genericName: 'Vitamin B-Complex + Zinc', category: 'Nutritional Supplement', form: MedicineForm.CAPSULE, strength: 'Standard', manufacturer: 'Pfizer' },
    { name: 'Shelcal 500', genericName: 'Calcium Carbonate + Vitamin D3', category: 'Mineral Supplement', form: MedicineForm.TABLET, strength: '500 mg + 250 IU', manufacturer: 'Torrent Pharma' },
  ];

  for (const med of foundationalMedicines) {
    await prisma.medicine.create({
      data: {
        hospitalId: hospitalMetro.id,
        ...med,
      },
    });
  }

  // 12. Completed Clinical Encounter Workflow for Patient 1 (Arjun Mehta)
  console.log('Seeding Completed Clinical Encounter (Arjun Mehta)...');
  const appointment1 = await prisma.appointment.create({
    data: {
      hospitalId: hospitalMetro.id,
      patientId: patient1.id,
      doctorId: docSharma.id,
      departmentId: deptCardio.id,
      appointmentDate: new Date('2025-09-02'),
      startTime: '10:00',
      endTime: '10:30',
      status: AppointmentStatus.COMPLETED,
      type: AppointmentType.REGULAR,
      reason: 'Chest tightness on exertion and shortness of breath while climbing stairs',
      notes: 'Patient escorted by spouse. Electrocardiogram scheduled.',
    },
  });

  const encounter1 = await prisma.patientEncounter.create({
    data: {
      hospitalId: hospitalMetro.id,
      appointmentId: appointment1.id,
      patientId: patient1.id,
      doctorId: docSharma.id,
      status: EncounterStatus.COMPLETED,
      startedAt: new Date('2025-09-02T10:05:00Z'),
      completedAt: new Date('2025-09-02T10:35:00Z'),
    },
  });

  const medicalRecord1 = await prisma.medicalRecord.create({
    data: {
      hospitalId: hospitalMetro.id,
      encounterId: encounter1.id,
      patientId: patient1.id,
      doctorId: docSharma.id,
      chiefComplaint: 'Intermittent substernal chest discomfort exacerbated by moderate exertion, lasting 5-10 minutes, relieved by rest.',
      presentingSymptoms: 'Substernal pressure, mild dyspnea, no diaphoresis, no radiating arm pain.',
      clinicalNotes: 'S1, S2 heard normal. No murmurs or gallops. Lungs clear to auscultation bilaterally. Bilateral pedal pulses intact.',
      treatmentPlan: '1. Initiate Atorvastatin 20mg OD at bedtime.\n2. Scheduled fasting Lipid Profile.\n3. Lifestyle modification: salt reduction, 30 min daily brisk walking.\n4. Follow-up in 4 weeks.',
      followUpDate: new Date('2025-09-30'),
    },
  });

  // Vitals with Automated BMI Calculation
  // Height: 175 cm, Weight: 82 kg -> BMI = 82 / (1.75 * 1.75) = 26.8 (Overweight)
  await prisma.vital.create({
    data: {
      recordId: medicalRecord1.id,
      bpSystolic: 138,
      bpDiastolic: 88,
      heartRate: 78,
      temperature: 98.4,
      spo2: 99,
      respiratoryRate: 16,
      heightCm: 175.0,
      weightKg: 82.0,
      bmi: 26.8,
      notes: 'Stage 1 Hypertension noted. Borderline elevated BMI.',
    },
  });

  // Diagnoses (ICD-10)
  await prisma.diagnosis.create({
    data: {
      recordId: medicalRecord1.id,
      code: 'I20.9',
      description: 'Angina pectoris, unspecified',
      type: DiagnosisType.PROVISIONAL,
      isPrimary: true,
      notes: 'Requires stress echo for definitive evaluation.',
    },
  });

  await prisma.diagnosis.create({
    data: {
      recordId: medicalRecord1.id,
      code: 'I10',
      description: 'Essential (primary) hypertension',
      type: DiagnosisType.CONFIRMED,
      isPrimary: false,
    },
  });

  // Prescription
  const prescription1 = await prisma.prescription.create({
    data: {
      hospitalId: hospitalMetro.id,
      encounterId: encounter1.id,
      patientId: patient1.id,
      doctorId: docSharma.id,
      notes: 'Avoid grapefruit juice while taking Atorvastatin.',
      status: PrescriptionStatus.ISSUED,
    },
  });

  await prisma.prescriptionItem.create({
    data: {
      prescriptionId: prescription1.id,
      medicineId: medAtorvastatin.id,
      medicineName: 'Atorvastatin 20mg',
      dosage: '20 mg',
      frequency: PrescriptionFrequency.OD,
      durationDays: 30,
      route: 'ORAL',
      instructions: 'Take once daily at bedtime with water.',
      dispensedQuantity: 30,
    },
  });

  // Lab Order
  const labOrder1 = await prisma.labOrder.create({
    data: {
      hospitalId: hospitalMetro.id,
      orderNumber: 'LAB-2025-0902-001',
      encounterId: encounter1.id,
      patientId: patient1.id,
      doctorId: docSharma.id,
      status: LabOrderStatus.APPROVED,
      clinicalNotes: 'Evaluate dyslipidemia in patient with exertional angina.',
    },
  });

  await prisma.labOrderItem.create({
    data: {
      orderId: labOrder1.id,
      testId: labTestLipid.id,
      resultValue: '215 mg/dL',
      resultValueNumeric: 215,
      resultUnit: 'mg/dL',
      flag: LabResultFlag.HIGH,
      referenceRangeText: 'Desirable: < 200 mg/dL',
      technicianNotes: 'Specimen collected after 12-hour overnight fast. Serum slightly lipemic.',
      completedAt: new Date('2025-09-02T16:30:00Z'),
    },
  });

  // Consolidated Financial Invoice
  const invoice1 = await prisma.invoice.create({
    data: {
      hospitalId: hospitalMetro.id,
      patientId: patient1.id,
      appointmentId: appointment1.id,
      encounterId: encounter1.id,
      invoiceNumber: 'INV-METRO-2025-00101',
      subtotal: 1550.0, // Consultation (800) + Lab (750)
      taxAmount: 77.5,  // 5% tax
      discountAmount: 0.0,
      totalAmount: 1627.5,
      paidAmount: 1627.5,
      status: InvoiceStatus.PAID,
    },
  });

  await prisma.invoiceItem.create({
    data: {
      invoiceId: invoice1.id,
      type: InvoiceItemType.CONSULTATION,
      description: 'Consultation Fee — Dr. Rajesh Sharma (Cardiology)',
      quantity: 1,
      unitPrice: 800.0,
      totalPrice: 800.0,
    },
  });

  await prisma.invoiceItem.create({
    data: {
      invoiceId: invoice1.id,
      type: InvoiceItemType.LAB_TEST,
      description: 'Lipid Profile Comprehensive (Fast)',
      quantity: 1,
      unitPrice: 750.0,
      totalPrice: 750.0,
    },
  });

  await prisma.payment.create({
    data: {
      hospitalId: hospitalMetro.id,
      invoiceId: invoice1.id,
      amount: 1627.5,
      method: PaymentMethod.CASH,
      status: PaymentStatus.SUCCESS,
      transactionReference: 'RCPT-CASH-20250902-0042',
      paidAt: new Date('2025-09-02T11:15:00Z'),
    },
  });

  // 13. Upcoming Appointment for Patient 2 (Kavita Kulkarni)
  console.log('Seeding Upcoming Appointment (Kavita Kulkarni)...');
  await prisma.appointment.create({
    data: {
      hospitalId: hospitalMetro.id,
      patientId: patient2.id,
      doctorId: docMenon.id,
      departmentId: deptGeneral.id,
      appointmentDate: new Date('2025-09-10'),
      startTime: '10:30',
      endTime: '11:00',
      status: AppointmentStatus.CONFIRMED,
      type: AppointmentType.REGULAR,
      reason: 'Routine quarterly diabetes and metabolic follow-up.',
    },
  });

  // 13.1 Historical Appointments Spanning 2 Weeks (PRD Requirement)
  console.log('Seeding 2-Week Historical and Upcoming Appointments (PRD Requirement)...');
  const baseDate = new Date();
  const appointmentStatuses = [
    AppointmentStatus.COMPLETED,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.COMPLETED,
    AppointmentStatus.CONFIRMED,
    AppointmentStatus.CANCELLED,
    AppointmentStatus.SCHEDULED,
  ];

  for (let dayOffset = -14; dayOffset <= 0; dayOffset++) {
    const apptDate = new Date(baseDate);
    apptDate.setDate(apptDate.getDate() + dayOffset);

    for (let slot = 0; slot < 2; slot++) {
      const patientIdx = Math.abs(dayOffset * 2 + slot) % allPatients.length;
      const doctorIdx = (Math.abs(dayOffset) + slot) % allDoctors.length;
      const patient = allPatients[patientIdx];
      const doctor = allDoctors[doctorIdx];
      const hour = 9 + slot * 2;
      const startTime = `${hour.toString().padStart(2, '0')}:00`;
      const endTime = `${hour.toString().padStart(2, '0')}:30`;
      const status = dayOffset < -2 
        ? AppointmentStatus.COMPLETED 
        : appointmentStatuses[Math.abs(dayOffset + slot) % appointmentStatuses.length];

      await prisma.appointment.create({
        data: {
          hospitalId: doctor.hospitalId,
          patientId: patient.id,
          doctorId: doctor.id,
          departmentId: doctor.departmentId,
          appointmentDate: apptDate,
          startTime,
          endTime,
          status,
          type: AppointmentType.REGULAR,
          reason: `Follow-up evaluation on Day offset ${dayOffset}`,
        },
      });
    }
  }

  // 14. Inpatient Rooms, Beds & Inpatient Admission
  console.log('Seeding Inpatient Rooms and Beds...');
  const roomIcu = await (prisma as any).room.create({
    data: {
      hospitalId: hospitalMetro.id,
      roomNumber: 'ICU-201',
      name: 'Intensive Coronary Care Unit',
      type: RoomType.ICU,
      floor: '2',
      departmentId: deptCardio.id,
      dailyRate: 6500.0,
    },
  });

  const roomGeneral = await (prisma as any).room.create({
    data: {
      hospitalId: hospitalMetro.id,
      roomNumber: 'WARD-104',
      name: 'General Medical Inpatient Ward',
      type: RoomType.GENERAL_WARD,
      floor: '1',
      departmentId: deptGeneral.id,
      dailyRate: 1500.0,
    },
  });

  const roomDeluxe = await (prisma as any).room.create({
    data: {
      hospitalId: hospitalMetro.id,
      roomNumber: 'PVT-302',
      name: 'Executive Deluxe Suite',
      type: RoomType.PRIVATE,
      floor: '3',
      departmentId: deptCardio.id,
      dailyRate: 4500.0,
    },
  });

  const bedIcu1 = await (prisma as any).bed.create({
    data: {
      hospitalId: hospitalMetro.id,
      roomId: roomIcu.id,
      bedNumber: 'ICU-201-A',
      status: BedStatus.AVAILABLE,
    },
  });

  const bedIcu2 = await (prisma as any).bed.create({
    data: {
      hospitalId: hospitalMetro.id,
      roomId: roomIcu.id,
      bedNumber: 'ICU-201-B',
      status: BedStatus.AVAILABLE,
    },
  });

  const bedGen1 = await (prisma as any).bed.create({
    data: {
      hospitalId: hospitalMetro.id,
      roomId: roomGeneral.id,
      bedNumber: 'GEN-104-01',
      status: BedStatus.AVAILABLE,
    },
  });

  const bedDeluxe = await (prisma as any).bed.create({
    data: {
      hospitalId: hospitalMetro.id,
      roomId: roomDeluxe.id,
      bedNumber: 'PVT-302-01',
      status: BedStatus.OCCUPIED,
    },
  });

  // Sample inpatient admission for Arjun Sharma
  await (prisma as any).bedAssignment.create({
    data: {
      hospitalId: hospitalMetro.id,
      bedId: bedDeluxe.id,
      patientId: patient1.id,
      admittedAt: new Date('2025-09-02T12:00:00Z'),
      notes: 'Admitted for 48h telemetry observation post acute coronary angina episode.',
    },
  });

  // 15. In-App Notifications
  console.log('Seeding Sample Notifications...');
  await prisma.notification.create({
    data: {
      hospitalId: hospitalMetro.id,
      userId: userPatient1.id,
      title: 'Lab Report Available',
      message: 'Your Lipid Profile and Fasting Blood Glucose results have been verified by Pathology.',
      channel: 'IN_APP',
      status: 'SENT',
      metadataJson: {
        type: 'LAB_REPORT',
        patientId: patient1.id,
      },
    },
  });

  await prisma.notification.create({
    data: {
      hospitalId: hospitalMetro.id,
      userId: userDocSharma.id,
      title: 'New Patient Inpatient Admission',
      message: 'Patient Arjun Sharma has been admitted to Executive Deluxe Suite PVT-302.',
      channel: 'IN_APP',
      status: 'SENT',
      metadataJson: {
        type: 'BED_ASSIGNMENT',
        bedId: bedDeluxe.id,
      },
    },
  });

  console.log('--- MedCore HMS Seed Complete Successfully! ---');
  console.log('Default Seed User Credentials (all passwords: Password123!):');
  console.log('Super Admin:     superadmin@medcore.io');
  console.log('Hospital Admin:  admin.metro@medcore.io');
  console.log('Doctor:          dr.sharma@metrogeneral.org');
  console.log('Doctor:          dr.menon@metrogeneral.org');
  console.log('Nurse:           nurse.sunita@metrogeneral.org');
  console.log('Receptionist:    reception.rahul@metrogeneral.org');
  console.log('Lab Tech:        lab.tech@metrogeneral.org');
  console.log('Pharmacist:      pharmacy.priya@metrogeneral.org');
  console.log('Accountant:      accounts.amit@metrogeneral.org');
  console.log('Patient:         patient.arjun@gmail.com');
}

main()
  .catch((e) => {
    console.error('Seed execution error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
