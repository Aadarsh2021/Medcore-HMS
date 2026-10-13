import 'dotenv/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

async function runS3SmokeTest() {
  console.log('=== MedCore HMS — Real Cloud AWS S3 Live Smoke Test ===');

  const region = process.env.S3_REGION || process.env.AWS_REGION || 'ap-south-1';
  const bucket = process.env.S3_BUCKET || process.env.AWS_S3_BUCKET || 'medcore-storage-bucket';
  const endpoint = process.env.S3_ENDPOINT || process.env.AWS_S3_ENDPOINT;

  const accessKeyId = process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;

  if (!accessKeyId || !secretAccessKey) {
    console.error('❌ STATUS: BLOCKED — Missing AWS S3 credentials (S3_ACCESS_KEY_ID or S3_SECRET_ACCESS_KEY is not defined in environment).');
    process.exit(1);
  }

  // Masked check
  const isLikelyPlaceholder = accessKeyId.includes('[YOUR') || accessKeyId === 'test-key-id' || accessKeyId.startsWith('dummy');
  if (isLikelyPlaceholder) {
    console.error('❌ STATUS: BLOCKED — Placeholder credentials detected in environment. Real cloud smoke test requires live IAM credentials.');
    process.exit(1);
  }

  console.log(`Target Configuration:
- Bucket: ${bucket}
- Region: ${region}
- Custom Endpoint: ${endpoint || 'AWS Standard S3 Endpoint'}
- Key ID prefix: ${accessKeyId.substring(0, 4)}...`);

  const clientConfig: any = {
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: !!endpoint,
  };

  if (endpoint) {
    clientConfig.endpoint = endpoint;
  }

  const s3 = new S3Client(clientConfig);
  const testId = randomUUID();
  const testKey = `smoke-tests/${testId}/connectivity-check.txt`;
  const testPayload = `MedCore HMS AWS S3 connectivity verification payload - timestamp: ${new Date().toISOString()}`;

  try {
    // 1. Upload Test
    console.log(`[Step 1/3] Uploading verification object to 's3://${bucket}/${testKey}'...`);
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: testKey,
        Body: Buffer.from(testPayload, 'utf-8'),
        ContentType: 'text/plain',
      }),
    );
    console.log('✅ Step 1 SUCCESS: PutObject command completed.');

    // 2. Read / Download Test
    console.log(`[Step 2/3] Retrieving verification object from S3...`);
    const getRes = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: testKey,
      }),
    );
    const bodyString = await getRes.Body?.transformToString();
    if (bodyString !== testPayload) {
      throw new Error(`Data integrity mismatch: downloaded content did not match upload payload.`);
    }
    console.log('✅ Step 2 SUCCESS: GetObject verified data integrity.');

    // 3. Delete / Cleanup Test
    console.log(`[Step 3/3] Cleaning up verification object...`);
    await s3.send(
      new DeleteObjectCommand({
        Bucket: bucket,
        Key: testKey,
      }),
    );
    console.log('✅ Step 3 SUCCESS: DeleteObject cleaned up test prefix.');

    console.log('\n🎉 ALL S3 CLOUD SMOKE TESTS PASSED (100% LIVE VERIFIED)!');
    process.exit(0);
  } catch (err: any) {
    console.error(`\n❌ S3 LIVE SMOKE TEST FAILED: ${err.name || 'Error'} - ${err.message}`);
    console.error(`Status: BLOCKED — Ensure bucket '${bucket}' exists in region '${region}' and IAM credentials possess s3:PutObject, s3:GetObject, s3:DeleteObject.`);
    process.exit(1);
  }
}

runS3SmokeTest();
