import cron from 'node-cron';
import { cleanupExpiredInvitations } from '../services/invitationService';

/**
 * Initialize scheduled jobs
 *
 * Note: Calendar syncing is now triggered on-demand when users open the app,
 * rather than running on a fixed schedule. This eliminates the need for Redis.
 */
export const initializeScheduler = () => {
  // Schedule cleanup of expired invitations daily at 2 AM
  // Cron pattern: 0 2 * * * = every day at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    console.log('🧹 Scheduled cleanup of expired invitations at', new Date().toISOString());

    try {
      await cleanupExpiredInvitations();
    } catch (error) {
      console.error('❌ Failed to cleanup expired invitations:', error);
    }
  });

  console.log('📅 Scheduler initialized: Expired invitations cleanup daily at 2 AM');
  console.log('📱 Calendar sync: Triggered on app load (no background sync)');
};
