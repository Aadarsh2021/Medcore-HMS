/**
 * ==============================================================================
 * MedCore HMS — Supabase Database Keep-Alive Script
 * ==============================================================================
 * Prevents Supabase Free Tier projects from pausing after 7 days of inactivity
 * by executing a lightweight database query and recording a heartbeat timestamp.
 * ==============================================================================
 */

import { PrismaClient } from '@prisma/client';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function keepAlive() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Initiating MedCore HMS Database Heartbeat Ping...`);

  try {
    const startTime = Date.now();
    // Lightweight heartbeat query directly on PostgreSQL
    const result = await prisma.$queryRaw<Array<{ ping: number }>>`SELECT 1 as ping;`;
    const latencyMs = Date.now() - startTime;

    // Verify hospital count as a functional application check
    const hospitalCount = await prisma.hospital.count();

    console.log(`[${timestamp}] SUCCESS: Database is active and responsive!`);
    console.log(`- Query Latency: ${latencyMs}ms`);
    console.log(`- Active Hospitals in DB: ${hospitalCount}`);
    console.log(`- Heartbeat result:`, result);

    process.exit(0);
  } catch (error) {
    console.error(`[${timestamp}] FAILED: Unable to ping Supabase database:`, error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

keepAlive();
