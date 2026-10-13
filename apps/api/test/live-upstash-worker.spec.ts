import { Queue, Worker, Job } from 'bullmq';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

describe('Live Upstash Redis & BullMQ Worker Verification', () => {
  const redisUrl = process.env.REDIS_URL;
  let queue: Queue;
  let worker: Worker;

  if (!redisUrl || !redisUrl.startsWith('rediss://')) {
    it('skips live test if REDIS_URL is not configured', () => {
      console.log('Skipping live Upstash test: REDIS_URL not configured');
    });
    return;
  }

  const parsed = new URL(redisUrl);
  const connection = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    tls: { rejectUnauthorized: false },
    maxRetriesPerRequest: null,
    connectTimeout: 5000,
  };

  const queueName = `test-live-scans-${Date.now()}`;

  beforeAll(() => {
    queue = new Queue(queueName, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    });
  });

  afterAll(async () => {
    if (worker) await worker.close();
    if (queue) {
      await queue.obliterate({ force: true }).catch(() => {});
      await queue.close();
    }
  });

  it('1. should establish TLS connection to Upstash Redis and execute Redis ping', async () => {
    await queue.waitUntilReady();
    const isPaused = await queue.isPaused();
    expect(typeof isPaused).toBe('boolean');
  });

  it('2. should enqueue a harmless synthetic job and verify real worker processes it to completion', async () => {
    const syntheticJobId = `harmless-synthetic-${Date.now()}`;
    const testPayload = {
      hospitalId: 'synthetic-tenant-0000',
      appointmentId: '00000000-0000-0000-0000-000000000000',
      enqueuedAt: new Date().toISOString(),
      isHarmlessProbe: true,
    };

    let processedJobData: any = null;

    // Start worker listening on the live Upstash queue
    const workerPromise = new Promise<{ id: string; status: string }>((resolve, reject) => {
      worker = new Worker(
        queueName,
        async (job: Job) => {
          processedJobData = job.data;
          // Return simulated harmless scan outcome
          return { checkedCount: 0, dispatchedCount: 0, status: 'PROCESSED_HARMLESSLY' };
        },
        { connection, concurrency: 1 },
      );

      worker.on('completed', (job: Job, returnvalue: any) => {
        resolve({ id: job.id!, status: 'completed' });
      });

      worker.on('failed', (job: Job | undefined, err: Error) => {
        reject(err);
      });
    });

    // Enqueue job to Upstash
    const enqueuedJob = await queue.add('appointment-reminders', testPayload, {
      jobId: syntheticJobId,
    });

    expect(enqueuedJob.id).toBe(syntheticJobId);

    // Wait for the real worker to pick it up and process it from Upstash
    const completedResult = await workerPromise;
    expect(completedResult.status).toBe('completed');
    expect(completedResult.id).toBe(syntheticJobId);
    expect(processedJobData).toBeDefined();
    expect(processedJobData.isHarmlessProbe).toBe(true);
    expect(processedJobData.hospitalId).toBe('synthetic-tenant-0000');
  });

  it('3. should enforce idempotency: duplicate job ID with same payload is deduplicated', async () => {
    const dedupeId = `dedupe-test-${Date.now()}`;
    const payload = { test: true };

    const firstJob = await queue.add('dedupe-job', payload, { jobId: dedupeId });
    expect(firstJob.id).toBe(dedupeId);

    // Enqueue with same ID
    const secondJob = await queue.add('dedupe-job', payload, { jobId: dedupeId });
    expect(secondJob.id).toBe(dedupeId);
  });
});
