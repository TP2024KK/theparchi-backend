import { runExpiryCheck } from './subscription.service.js';

/**
 * Runs daily at midnight to:
 * 1. Move expired active subscriptions → grace period
 * 2. Move expired grace periods → free plan (suspend)
 * 3. Send renewal reminders (3 days before expiry)
 */
export const startSubscriptionCron = () => {
  console.log('[SubscriptionCron] Daily expiry check scheduled (runs every 24h)');

  const runCheck = async () => {
    try {
      const result = await runExpiryCheck();
      console.log(`[SubscriptionCron] Done — grace started: ${result.gracePeriodStarted}, suspended: ${result.suspended}, reminders: ${result.remindersSent}`);
    } catch (err) {
      console.error('[SubscriptionCron] Error:', err.message);
    }
  };

  // Run immediately on startup (catches any missed runs during downtime)
  runCheck();

  // Then every 24 hours
  const timer = setInterval(runCheck, 24 * 60 * 60 * 1000);

  process.on('SIGTERM', () => clearInterval(timer));
  process.on('SIGINT', () => clearInterval(timer));

  return timer;
};
