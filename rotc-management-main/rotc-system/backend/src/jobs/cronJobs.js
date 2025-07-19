const cron = require('node-cron');
const AttendanceModel = require('../models/attendance');
const SettingsModel = require('../models/settings');
const AuditModel = require('../models/audit');
const { sendPushNotificationToAbsentCadets, sendPushNotificationForEvent } = require('../utils/notifications');
const { logger } = require('../utils/logger');
const { exec } = require('child_process');

// Disable scanner and mark absent cadets at 12:15 PM daily
cron.schedule('15 12 * * *', async () => {
  try {
    logger.info('Running daily 12:15 PM scanner disable and absent marking task');

    // Disable scanner
    await SettingsModel.updateSetting('scanner_state', 'off');
    await SettingsModel.updateSetting('evening_enabled', 'false');

    // Mark absent cadets who haven't timed out
    const cutoffTime = new Date();
    cutoffTime.setHours(12, 15, 0, 0);
    const date = new Date().toISOString().slice(0, 10);
    const absentCadets = await AttendanceModel.markAbsentCadets(date, cutoffTime);

    // Send push notifications to absent cadets
    await sendPushNotificationToAbsentCadets(absentCadets);

    logger.info('Daily scanner disable and absent marking task completed');
  } catch (error) {
    logger.error('Error in daily scanner disable and absent marking task:', error);
  }
});

// Delete attendance records older than 2 years daily at 1:00 AM
cron.schedule('0 1 * * *', async () => {
  try {
    logger.info('Running daily attendance records cleanup task');

    const twoYearsAgo = new Date();
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    // Assuming AttendanceModel has a method to delete old records
    await AttendanceModel.deleteOldRecords(twoYearsAgo.toISOString().slice(0, 10));

    logger.info('Daily attendance records cleanup task completed');
  } catch (error) {
    logger.error('Error in daily attendance records cleanup task:', error);
  }
});

// Check events to auto-enable scanner and send notifications daily at 2:00 AM
cron.schedule('0 2 * * *', async () => {
  try {
    logger.info('Running daily event check task');

    const today = new Date().toISOString().slice(0, 10);
    const events = await SettingsModel.getEventsForDate(today);

    for (const event of events) {
      if (event.auto_enable_scanner) {
        await SettingsModel.updateSetting('scanner_state', 'on');
        await sendPushNotificationForEvent(event);
        logger.info(`Scanner auto-enabled for event ${event.event_name}`);
      }
    }

    logger.info('Daily event check task completed');
  } catch (error) {
    logger.error('Error in daily event check task:', error);
  }
});

// Daily backup of PostgreSQL and S3 bucket at 3:00 AM
cron.schedule('0 3 * * *', () => {
  logger.info('Running daily backup task');

  // Backup PostgreSQL database
  exec('pg_dump -U postgres -F c rotcdb > /backups/rotcdb_$(date +\\%Y\\%m\\%d).dump', (error, stdout, stderr) => {
    if (error) {
      logger.error('PostgreSQL backup error:', error);
      return;
    }
    logger.info('PostgreSQL backup completed');
  });

  // Backup S3 bucket (assuming AWS CLI configured)
  exec('aws s3 sync s3://your-s3-bucket /backups/s3_backup_$(date +\\%Y\\%m\\%d)', (error, stdout, stderr) => {
    if (error) {
      logger.error('S3 backup error:', error);
      return;
    }
    logger.info('S3 backup completed');
  });
});

module.exports = cron;
