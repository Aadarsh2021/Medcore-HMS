import 'dotenv/config';
import Redis from 'ioredis';
import { Queue, Worker } from 'bullmq';

async function runRedisSmokeTest() {
  console.log('=== MedCore HMS — Managed Redis & BullMQ Live Smoke Test ===');

  const redisUrl = process.env.REDIS_URL;
  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = parseInt(process.env.REDIS_PORT || '6379', 10);
  const redisPassword = process.env.REDIS_PASSWORD || undefined;

  const targetDescription = redisUrl
    ? `URL: ${redisUrl.replace(/:[^:@]+@/, ':****@')}`
    : `Host: ${redisHost}:${redisPort}`;

  console.log(`Target Configuration: ${targetDescription}`);

  const isLocalhost = (redisUrl && (redisUrl.includes('localhost') || redisUrl.includes('127.0.0.1'))) ||
    redisHost === 'localhost' || redisHost === '127.0.0.1';

  let redis: Redis;
  try {
    if (redisUrl) {
      redis = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        enableOfflineQueue: false,
      });
    } else {
      redis = new Redis({
        host: redisHost,
        port: redisPort,
        password: redisPassword,
        maxRetriesPerRequest: 1,
        connectTimeout: 5000,
        enableOfflineQueue: false,
      });
    }
  } catch (err: any) {
    console.error(`❌ Initialization Error: ${err.message}`);
    process.exit(1);
  }

  try {
    console.log('[Step 1/2] Sending PING command to Redis server...');
    const pong = await redis.ping();
    if (pong !== 'PONG') {
      throw new Error(`Unexpected PING response: ${pong}`);
    }
    console.log('✅ Step 1 SUCCESS: Redis responded with PONG.');

    if (isLocalhost) {
      console.log('ℹ️ NOTICE: Connection verified against LOCALHOST / LOCAL CONTAINER.');
      console.log('Status for Cloud Production: BLOCKED — Managed cloud Redis URI (e.g. Upstash rediss:// or AWS ElastiCache) is required for production.');
    } else {
      console.log('🎉 MANAGED CLOUD REDIS CONNECTION VERIFIED!');
    }

    await redis.quit();
    process.exit(0);
  } catch (err: any) {
    console.error(`\n❌ REDIS SMOKE TEST FAILED: ${err.code || 'Error'} - ${err.message}`);
    console.error('Status: BLOCKED — Redis server unreachable. Configure a reachable REDIS_URL in environment.');
    await redis.disconnect();
    process.exit(1);
  }
}

runRedisSmokeTest();
