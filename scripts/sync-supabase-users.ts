import { PrismaClient } from '@prisma/client';
import { createClient, User as SupabaseUser } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing Supabase URL or Service Role Key in environment.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function main() {
  console.log('=== Synchronizing Prisma Users to Supabase Auth ===');
  const dbUsers = await prisma.user.findMany({
    where: { isActive: true },
    include: { hospital: true },
  });

  console.log(`Found ${dbUsers.length} active users in Prisma database.`);

  const { data: listData, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 100,
  });

  if (listError) {
    console.error('Failed to query Supabase Auth users:', listError.message);
    process.exit(1);
  }

  const existingAuthUsers: SupabaseUser[] = listData.users || [];
  console.log(`Current existing users in Supabase Auth: ${existingAuthUsers.length}`);

  let createdCount = 0;
  let linkedCount = 0;

  for (const dbUser of dbUsers) {
    const email = dbUser.email.toLowerCase();
    let authUser = existingAuthUsers.find((u: SupabaseUser) => u.email?.toLowerCase() === email);

    if (!authUser) {
      console.log(`Creating Supabase Auth user for [${dbUser.role}]: ${email}`);
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: 'Password123!',
        email_confirm: true,
        user_metadata: {
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          role: dbUser.role,
          hospitalId: dbUser.hospitalId,
          hospitalName: dbUser.hospital?.name,
        },
      });

      if (createError) {
        console.error(`  -> Failed to create ${email}:`, createError.message);
        continue;
      }

      authUser = createData.user;
      createdCount++;
    } else {
      console.log(`User ${email} already exists in Supabase Auth.`);
    }

    if (authUser && dbUser.supabaseAuthId !== authUser.id) {
      await prisma.user.update({
        where: { id: dbUser.id },
        data: {
          supabaseAuthId: authUser.id,
          isEmailVerified: true,
        },
      });
      linkedCount++;
      console.log(`  -> Linked Supabase UID ${authUser.id} to Prisma User ${dbUser.id}`);
    }
  }

  console.log(`=== Synchronization Complete ===`);
  console.log(`Created: ${createdCount} users in Supabase Auth.`);
  console.log(`Linked: ${linkedCount} users in Prisma DB.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
