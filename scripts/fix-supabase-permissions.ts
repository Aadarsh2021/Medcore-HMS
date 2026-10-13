import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function fixPermissions() {
  console.log('Granting schema and table permissions to anon, authenticated, and service_role...');
  
  await prisma.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;`);
  await prisma.$executeRawUnsafe(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;`);
  await prisma.$executeRawUnsafe(`GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;`);
  await prisma.$executeRawUnsafe(`GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;`);
  await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;`);
  await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;`);
  await prisma.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;`);
  
  console.log('SUCCESS: Permissions granted!');
  await prisma.$disconnect();
}

fixPermissions().catch((err) => {
  console.error('Error granting permissions:', err);
  process.exit(1);
});
