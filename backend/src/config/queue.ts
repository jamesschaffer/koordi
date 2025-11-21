import Bull from 'bull';
import dotenv from 'dotenv';

dotenv.config();

// Redis connection configuration
const redisConfig = {
  redis: process.env.REDIS_URL || 'redis://localhost:6379',
};

// Create queue for ICS calendar sync jobs
export const icsSyncQueue = new Bull('ics-sync', redisConfig);

// Queue event handlers for monitoring
icsSyncQueue.on('error', (error) => {
  console.error('❌ ICS Sync Queue Error:', error);
});

icsSyncQueue.on('waiting', (jobId) => {
  console.log(`⏳ Job ${jobId} is waiting`);
});

icsSyncQueue.on('active', (job) => {
  console.log(`🔄 Job ${job.id} has started processing`);
});

icsSyncQueue.on('completed', (job, result) => {
  console.log(`✅ Job ${job.id} completed:`, result);
});

icsSyncQueue.on('failed', (job, err) => {
  console.error(`❌ Job ${job.id} failed:`, err.message);
});

icsSyncQueue.on('stalled', (job) => {
  console.warn(`⚠️  Job ${job.id} has stalled`);
});

export default icsSyncQueue;
