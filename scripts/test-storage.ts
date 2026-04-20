import { storagePut } from '../server/storage';

async function main() {
  try {
    const result = await storagePut(
      `test/ping-${Date.now()}.txt`,
      Buffer.from('hello storage test'),
      'text/plain'
    );
    console.log('✅ S3 upload OK:', result.url);
  } catch (e: any) {
    console.error('❌ S3 upload FAILED:', e.message);
  }
}

main();
