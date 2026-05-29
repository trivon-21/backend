const nodemailer = require('nodemailer');
const User = require('../models/User');

class MaintenanceNotificationService {
  /**
   * Get all non-super-admin users eligible for maintenance notifications.
   */
  async getMaintenanceRecipients() {
    return User.find({ role: { $ne: 'SUPER_ADMIN' } })
      .select('_id fullName email role')
      .lean();
  }

  /**
   * Get email transporter
   */
  getEmailTransporter() {
    const emailUser = String(process.env.EMAIL_USER || '').trim();
    const emailPass = String(process.env.EMAIL_PASS || '').replace(/\s+/g, '');

    if (!emailUser || !emailPass) {
      throw new Error('EMAIL_NOT_CONFIGURED');
    }

    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: emailUser, pass: emailPass },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 10000,
    });
  }

  /**
   * Calculate time remaining until scheduled maintenance
   */
  calculateTimeRemaining(startTime) {
    const now = new Date();
    const diff = new Date(startTime) - now;

    if (diff <= 0) {
      return null;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    let timeString = '';
    if (days > 0) timeString += `${days}d `;
    if (hours > 0 || days > 0) timeString += `${hours}h `;
    timeString += `${minutes}m ${seconds}s`;

    return {
      days,
      hours,
      minutes,
      seconds,
      timeString: timeString.trim(),
      totalMs: diff,
    };
  }

  /**
   * Generate scheduled maintenance email HTML
   */
  generateScheduledMaintenanceEmailHtml(userName, startTime, endTime, message, reason, timeRemaining) {
    const startDate = new Date(startTime).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const endDate = new Date(endTime).toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff6b6b;">Scheduled System Maintenance</h2>

        <p>Hi ${userName},</p>

        <p>We will be performing scheduled maintenance on the AirLux system.</p>

        <div style="background-color: #f0f0f0; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Maintenance Window:</strong></p>
          <p>📅 Start: ${startDate}</p>
          <p>📅 End: ${endDate}</p>
          <p style="color: #ff6b6b; font-size: 16px; font-weight: bold;">⏱️ Time remaining: ${timeRemaining.timeString}</p>
        </div>

        ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}

        <p>During this maintenance window, the system will be temporarily unavailable. We apologize for any inconvenience this may cause.</p>

        <p>If you have any questions, please contact our support team at ${process.env.SUPPORT_EMAIL || 'support@airlux.lk'}.</p>

        <p>Thank you for your patience.</p>

        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        <p style="font-size: 12px; color: #888;">AirLux Team</p>
      </div>
    `;
  }

  /**
   * Generate instant maintenance email HTML
   */
  generateInstantMaintenanceEmailHtml(userName, message, reason) {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff6b6b;">System Maintenance in Progress</h2>

        <p>Hi ${userName},</p>

        <p>The AirLux system is currently under maintenance and temporarily unavailable.</p>

        <div style="background-color: #fff3cd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ffc107;">
          <p style="margin: 0;"><strong>⚠️ The system is currently undergoing maintenance.</strong></p>
          <p style="margin: 10px 0 0 0;">We will be back online as soon as possible.</p>
        </div>

        ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
        ${reason ? `<p><strong>Reason:</strong> ${reason}</p>` : ''}

        <p>If you have any questions, please contact our support team at ${process.env.SUPPORT_EMAIL || 'support@airlux.lk'}.</p>

        <p>Thank you for your patience.</p>

        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        <p style="font-size: 12px; color: #888;">AirLux Team</p>
      </div>
    `;
  }

  /**
   * Send maintenance emails to all users (batch with error handling)
   */
  async sendMaintenanceEmailsToAllUsers(maintenance) {
    try {
      const transporter = this.getEmailTransporter();
      const users = await this.getMaintenanceRecipients();
      const emailUsers = users.filter((user) => typeof user.email === 'string' && user.email.trim());

      if (emailUsers.length === 0) {
        console.log('No non-super-admin users with email found for maintenance notification');
        return { sent: 0, failed: 0, errors: [] };
      }

      let sent = 0;
      let failed = 0;
      const errors = [];

      const isScheduled = maintenance.scheduledStartTime && maintenance.scheduledEndTime;
      const isActive = maintenance.isActive;

      for (const user of emailUsers) {
        try {
          let html;
          let subject;

          if (isScheduled) {
            const timeRemaining = this.calculateTimeRemaining(maintenance.scheduledStartTime);
            subject = `[SCHEDULED] AirLux System Maintenance - ${timeRemaining.timeString} remaining`;
            html = this.generateScheduledMaintenanceEmailHtml(
              user.fullName,
              maintenance.scheduledStartTime,
              maintenance.scheduledEndTime,
              maintenance.message,
              maintenance.reason,
              timeRemaining
            );
          } else if (isActive) {
            subject = '[ALERT] AirLux System Under Maintenance';
            html = this.generateInstantMaintenanceEmailHtml(
              user.fullName,
              maintenance.message,
              maintenance.reason
            );
          } else {
            continue;
          }

          await transporter.sendMail({
            from: `AirLux <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject,
            html,
          });

          sent++;
        } catch (error) {
          failed++;
          errors.push({
            email: user.email,
            error: error.message,
          });
          console.error(`Failed to send maintenance email to ${user.email}:`, error);
        }
      }

      return { sent, failed, errors, total: emailUsers.length };
    } catch (error) {
      console.error('Error sending maintenance emails:', error);
      throw error;
    }
  }

  /**
   * Create maintenance notification for all users
   */
  async createMaintenanceNotificationsForAllUsers(maintenance) {
    try {
      const users = await this.getMaintenanceRecipients();

      if (users.length === 0) {
        console.log('No non-super-admin users found for maintenance notification');
        return { created: 0, failed: 0 };
      }

      let created = 0;
      let failed = 0;

      const isScheduled = maintenance.scheduledStartTime && maintenance.scheduledEndTime;
      const isActive = maintenance.isActive;

      for (const user of users) {
        try {
          let title;
          let message;
          let type = 'general';

          if (isScheduled) {
            const timeRemaining = this.calculateTimeRemaining(maintenance.scheduledStartTime);
            title = 'Scheduled Maintenance Coming';
            message = `System maintenance scheduled in ${timeRemaining.timeString}. Start: ${new Date(
              maintenance.scheduledStartTime
            ).toLocaleString()}`;
          } else if (isActive) {
            title = 'System Under Maintenance';
            message = 'The system is currently under maintenance. We will be back online soon.';
          } else {
            continue;
          }

          await User.findByIdAndUpdate(
            user._id,
            {
              $push: {
                notifications: {
                  type,
                  title,
                  message,
                  read: false,
                  createdAt: new Date(),
                },
              },
            },
            { new: true }
          );

          created++;
        } catch (error) {
          failed++;
          console.error(`Failed to create maintenance notification for user ${user._id}:`, error);
        }
      }

      return { created, failed, total: users.length };
    } catch (error) {
      console.error('Error creating maintenance notifications:', error);
      throw error;
    }
  }

  /**
   * Send maintenance notifications (both email and in-app)
   */
  async sendMaintenanceNotifications(maintenance) {
    const results = {
      emails: null,
      notifications: null,
      errors: [],
    };

    try {
      // Send emails
      try {
        results.emails = await this.sendMaintenanceEmailsToAllUsers(maintenance);
        console.log('Maintenance emails sent:', results.emails);
      } catch (error) {
        console.error('Error sending maintenance emails:', error);
        results.errors.push({
          type: 'EMAIL_SEND_FAILED',
          message: error.message,
        });
      }

      // Create notifications
      try {
        results.notifications = await this.createMaintenanceNotificationsForAllUsers(maintenance);
        console.log('Maintenance notifications created:', results.notifications);
      } catch (error) {
        console.error('Error creating maintenance notifications:', error);
        results.errors.push({
          type: 'NOTIFICATION_CREATE_FAILED',
          message: error.message,
        });
      }
    } catch (error) {
      console.error('Error sending maintenance notifications:', error);
      results.errors.push({
        type: 'NOTIFICATION_SERVICE_ERROR',
        message: error.message,
      });
    }

    return results;
  }
}

module.exports = new MaintenanceNotificationService();
