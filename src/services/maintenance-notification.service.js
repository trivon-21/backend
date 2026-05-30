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
   * Get shared branding and contact details for maintenance emails.
   */
  getEmailBranding() {
    const supportEmail = String(process.env.SUPPORT_EMAIL || 'support@airlux.lk').trim();

    return {
      appUrl: String(process.env.FRONTEND_URL || process.env.APP_URL || 'https://airlux.lk').trim(),
      supportEmail,
      supportPhone: String(process.env.SUPPORT_PHONE || '+94 11 234 5678').trim(),
      companyAddress: String(process.env.COMPANY_ADDRESS || '123 Galle Road, Colombo 03, Sri Lanka').trim(),
      unsubscribeHref: String(
        process.env.UNSUBSCRIBE_URL ||
          `mailto:${supportEmail}?subject=${encodeURIComponent('Unsubscribe from AirLux maintenance emails')}`
      ).trim(),
    };
  }

  /**
   * Escape user-provided content before inserting it into email HTML.
   */
  escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Format dates in a human-friendly, email-safe way.
   */
  formatEmailDate(value) {
    return new Date(value).toLocaleString('en-US', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  /**
   * Return a plain-English maintenance window summary.
   */
  formatWindowSummary(startTime, endTime) {
    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationMinutes = Math.max(0, Math.round((end - start) / (1000 * 60)));

    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      return null;
    }

    if (durationMinutes < 60) {
      return `${durationMinutes} minute${durationMinutes === 1 ? '' : 's'}`;
    }

    const hours = Math.floor(durationMinutes / 60);
    const minutes = durationMinutes % 60;

    if (minutes === 0) {
      return `${hours} hour${hours === 1 ? '' : 's'}`;
    }

    return `${hours} hour${hours === 1 ? '' : 's'} ${minutes} minute${minutes === 1 ? '' : 's'}`;
  }

  /**
   * Build the branded header shown at the top of every email.
   */
  buildLogoBlock(accentColor) {
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:0 0 24px 0;">
        <tr>
          <td style="padding:0; vertical-align:middle;">
            <div style="display:inline-block; width:46px; height:46px; border-radius:14px; background:${accentColor}; text-align:center; line-height:46px; font-family: Arial, Helvetica, sans-serif; font-size:18px; font-weight:700; color:#ffffff;">AL</div>
          </td>
          <td style="padding:0 0 0 14px; vertical-align:middle; font-family: Arial, Helvetica, sans-serif;">
            <div style="font-size:13px; line-height:1; letter-spacing:0.12em; text-transform:uppercase; color:#6b7280; margin-bottom:4px;">AirLux</div>
            <div style="font-size:22px; line-height:1.1; font-weight:700; color:#12221d;">AirLux maintenance update</div>
          </td>
        </tr>
      </table>
    `;
  }

  /**
   * Build a single prominent CTA button.
   */
  buildButton(label, href, backgroundColor) {
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:28px 0 0 0;">
        <tr>
          <td align="center" bgcolor="${backgroundColor}" style="border-radius:999px;">
            <a href="${href}" style="display:inline-block; padding:14px 24px; font-family: Arial, Helvetica, sans-serif; font-size:15px; font-weight:700; color:#ffffff; text-decoration:none; border-radius:999px;">${label}</a>
          </td>
        </tr>
      </table>
    `;
  }

  /**
   * Build the shared footer with unsubscribe and support details.
   */
  buildFooter({ supportEmail, supportPhone, companyAddress, unsubscribeHref, accentColor }) {
    return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin-top:28px; border-top:1px solid #e5e7eb; padding-top:18px;">
        <tr>
          <td style="font-family: Arial, Helvetica, sans-serif; font-size:12px; line-height:1.6; color:#6b7280;">
            <div style="margin-bottom:8px;">
              Need a hand? <a href="mailto:${supportEmail}" style="color:${accentColor}; text-decoration:none; font-weight:700;">Contact Support</a>
              <span style="color:#9ca3af;">&nbsp;|&nbsp;</span>
              <a href="${unsubscribeHref}" style="color:${accentColor}; text-decoration:none;">Unsubscribe</a>
            </div>
            <div style="margin-bottom:2px;">${this.escapeHtml(companyAddress)}</div>
            <div style="margin-bottom:2px;">Support: <a href="mailto:${supportEmail}" style="color:${accentColor}; text-decoration:none;">${this.escapeHtml(supportEmail)}</a></div>
            <div>Phone: <a href="tel:${supportPhone.replace(/[^+\d]/g, '')}" style="color:${accentColor}; text-decoration:none;">${this.escapeHtml(supportPhone)}</a></div>
          </td>
        </tr>
      </table>
    `;
  }

  /**
   * Wrap email content in a consistent branded layout.
   */
  buildEmailShell({
    accentColor,
    preheader,
    title,
    introHtml,
    bodyHtml,
    ctaLabel,
    ctaHref,
    footerNote,
    borderColor,
    badgeText,
  }) {
    const branding = this.getEmailBranding();
    const cardBorderColor = borderColor || '#e5e7eb';

    return `
      <!doctype html>
      <html lang="en">
        <body style="margin:0; padding:0; background:#f3f5f7;">
          <div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all; font-size:1px; line-height:1px; color:#f3f5f7;">
            ${this.escapeHtml(preheader)}
          </div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; background:#f3f5f7; width:100%;">
            <tr>
              <td align="center" style="padding:32px 16px;">
                <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; width:100%; max-width:600px; margin:0 auto;">
                  <tr>
                    <td style="padding:0 0 18px 0;">${this.buildLogoBlock(accentColor)}</td>
                  </tr>
                  <tr>
                    <td style="background:#ffffff; border:1px solid ${cardBorderColor}; border-radius:20px; overflow:hidden; box-shadow:0 10px 30px rgba(17,24,39,0.08);">
                      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                        <tr>
                          <td style="height:8px; background:${accentColor}; line-height:8px; font-size:0;">&nbsp;</td>
                        </tr>
                        <tr>
                          <td style="padding:34px 34px 8px 34px; font-family: Arial, Helvetica, sans-serif; color:#12221d;">
                            <div style="display:inline-block; margin-bottom:14px; padding:6px 12px; border-radius:999px; background:${accentColor}15; color:${accentColor}; font-size:12px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;">
                              ${this.escapeHtml(badgeText)}
                            </div>
                            <h1 style="margin:0 0 16px 0; font-size:28px; line-height:1.25; color:#12221d;">${this.escapeHtml(title)}</h1>
                            <p style="margin:0 0 16px 0; font-size:16px; line-height:1.7; color:#334155;">${introHtml}</p>
                            ${bodyHtml}
                            ${ctaLabel ? this.buildButton(ctaLabel, ctaHref, accentColor) : ''}
                            ${footerNote ? `<p style="margin:22px 0 0 0; font-size:14px; line-height:1.7; color:#475569;">${footerNote}</p>` : ''}
                          </td>
                        </tr>
                        <tr>
                          <td style="padding:0 34px 28px 34px;">${this.buildFooter(branding)}</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `;
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
    const branding = this.getEmailBranding();
    const startDate = this.formatEmailDate(startTime);
    const endDate = this.formatEmailDate(endTime);
    const windowSummary = this.formatWindowSummary(startTime, endTime);
    const safeUserName = this.escapeHtml(userName || 'there');
    const messageText = message ? this.escapeHtml(message) : 'a few behind-the-scenes improvements';
    const reasonText = reason ? this.escapeHtml(reason) : 'a smoother experience when you return';

    const bodyHtml = `
      <p style="margin:0 0 16px 0; font-size:16px; line-height:1.7; color:#334155;">We’re keeping the maintenance window short so you’re back up quickly.</p>
      <p style="margin:0 0 18px 0; font-size:16px; line-height:1.7; color:#334155;">This update covers ${messageText}${reason ? ` and focuses on ${reasonText}` : ''}. We’ll use the window to make sure everything is ready for a smoother, steadier AirLux experience.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:0 0 18px 0;">
        <tr>
          <td style="background:#fff7ed; border:1px solid #fed7aa; border-left:4px solid #f59e0b; border-radius:14px; padding:18px; font-family: Arial, Helvetica, sans-serif; color:#7c2d12;">
            <div style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px; color:#c2410c;">Maintenance window</div>
            <div style="font-size:15px; line-height:1.7; margin-bottom:6px;">Starts: ${this.escapeHtml(startDate)}</div>
            <div style="font-size:15px; line-height:1.7; margin-bottom:6px;">Ends: ${this.escapeHtml(endDate)}</div>
            <div style="font-size:15px; line-height:1.7; font-weight:700;">Expected downtime: about ${this.escapeHtml(windowSummary)}</div>
          </td>
        </tr>
      </table>
      <p style="margin:0; font-size:16px; line-height:1.7; color:#334155;">If you need a hand while we’re making these updates, just use the support button below and we’ll jump in.</p>
    `;

    return this.buildEmailShell({
      accentColor: '#d97706',
      preheader: 'AirLux scheduled maintenance starts soon.',
      title: `Hi ${safeUserName}, your AirLux maintenance reminder is here`,
      badgeText: 'Scheduled maintenance',
      introHtml: 'We’re getting a few things ready behind the scenes so AirLux comes back in better shape for you.',
      bodyHtml,
      ctaLabel: 'Contact Support',
      ctaHref: `mailto:${branding.supportEmail}?subject=${encodeURIComponent('AirLux scheduled maintenance support')}`,
      footerNote: 'Thanks for bearing with us while we finish the work. We’ve kept the window short so you’re back up quickly.',
      borderColor: '#fde68a',
    });
  }

  /**
   * Generate instant maintenance email HTML
   */
  generateInstantMaintenanceEmailHtml(userName, message, reason, estimatedBackOnlineAt) {
    const branding = this.getEmailBranding();
    const safeUserName = this.escapeHtml(userName || 'there');
    const messageText = message ? this.escapeHtml(message) : 'a short round of behind-the-scenes improvements';
    const reasonText = reason ? this.escapeHtml(reason) : 'getting everything running more smoothly';

    const backOnlineText = estimatedBackOnlineAt
      ? `Estimated back online: ${this.escapeHtml(this.formatEmailDate(estimatedBackOnlineAt))}`
      : 'Estimated back online: as soon as the work is finished and the checks pass.';

    const bodyHtml = `
      <p style="margin:0 0 16px 0; font-size:16px; line-height:1.7; color:#334155;">We’re doing some behind-the-scenes work to improve your experience, and AirLux is temporarily offline while we wrap it up.</p>
      <p style="margin:0 0 18px 0; font-size:16px; line-height:1.7; color:#334155;">The current maintenance covers ${messageText}${reason ? ` and is focused on ${reasonText}` : ''}.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:0 0 18px 0;">
        <tr>
          <td style="background:#fef2f2; border:1px solid #fecaca; border-left:4px solid #ef4444; border-radius:14px; padding:18px; font-family: Arial, Helvetica, sans-serif; color:#7f1d1d;">
            <div style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px; color:#b91c1c;">What to expect</div>
            <div style="font-size:16px; line-height:1.7; font-weight:700; margin-bottom:6px;">${this.escapeHtml(backOnlineText)}</div>
            <div style="font-size:15px; line-height:1.7;">We’re keeping an eye on it and will bring everything back as soon as the checks are complete.</div>
          </td>
        </tr>
      </table>
      <p style="margin:0; font-size:16px; line-height:1.7; color:#334155;">If you’re waiting to get something done, reach out and we’ll help you work out the best next step.</p>
    `;

    return this.buildEmailShell({
      accentColor: '#dc2626',
      preheader: 'AirLux is undergoing maintenance and will be back shortly.',
      title: `Hi ${safeUserName}, AirLux is currently undergoing maintenance`,
      badgeText: 'Maintenance alert',
      introHtml: 'We’re making a few careful updates so the platform comes back cleaner and more reliable for you.',
      bodyHtml,
      ctaLabel: 'Contact Support',
      ctaHref: `mailto:${branding.supportEmail}?subject=${encodeURIComponent('AirLux maintenance support')}`,
      footerNote: 'Thanks for sticking with us while we get things ready again.',
      borderColor: '#fecaca',
    });
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
            subject = 'Reminder: AirLux scheduled maintenance is coming up';
            html = this.generateScheduledMaintenanceEmailHtml(
              user.fullName,
              maintenance.scheduledStartTime,
              maintenance.scheduledEndTime,
              maintenance.message,
              maintenance.reason,
              timeRemaining
            );
          } else if (isActive) {
            subject = "AirLux is currently undergoing maintenance — we'll be back shortly";
            html = this.generateInstantMaintenanceEmailHtml(
              user.fullName,
              maintenance.message,
              maintenance.reason,
              maintenance.endTime || maintenance.scheduledEndTime
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
   * Send the instant-style email when a scheduled maintenance window actually starts.
   */
  async sendScheduledMaintenanceStartEmailsToAllUsers(maintenance) {
    try {
      const transporter = this.getEmailTransporter();
      const users = await this.getMaintenanceRecipients();
      const emailUsers = users.filter((user) => typeof user.email === 'string' && user.email.trim());

      if (emailUsers.length === 0) {
        console.log('No non-super-admin users with email found for scheduled maintenance start notification');
        return { sent: 0, failed: 0, errors: [] };
      }

      let sent = 0;
      let failed = 0;
      const errors = [];
      const estimatedBackOnlineAt = maintenance.endTime || maintenance.scheduledEndTime;

      for (const user of emailUsers) {
        try {
          const html = this.generateInstantMaintenanceEmailHtml(
            user.fullName,
            maintenance.message,
            maintenance.reason,
            estimatedBackOnlineAt
          );

          await transporter.sendMail({
            from: `AirLux <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: "AirLux is currently undergoing maintenance — we'll be back shortly",
            html,
          });

          sent++;
        } catch (error) {
          failed++;
          errors.push({
            email: user.email,
            error: error.message,
          });
          console.error(`Failed to send scheduled maintenance start email to ${user.email}:`, error);
        }
      }

      return { sent, failed, errors, total: emailUsers.length };
    } catch (error) {
      console.error('Error sending scheduled maintenance start emails:', error);
      throw error;
    }
  }

  /**
   * Check whether a scheduled maintenance window has started and send the one-time email.
   */
  async processScheduledMaintenanceStartNotifications() {
    try {
      const config = await require('../utils/config-cache').getSystemConfig();
      const maintenance = config.maintenance;

      if (!maintenance?.scheduledStartTime || !maintenance?.scheduledEndTime) {
        return { skipped: true, reason: 'NO_SCHEDULED_MAINTENANCE' };
      }

      if (maintenance.scheduledStartEmailSentAt) {
        return { skipped: true, reason: 'ALREADY_SENT' };
      }

      const now = new Date();
      const startTime = new Date(maintenance.scheduledStartTime);
      const endTime = new Date(maintenance.scheduledEndTime);

      if (Number.isNaN(startTime.getTime()) || Number.isNaN(endTime.getTime())) {
        return { skipped: true, reason: 'INVALID_SCHEDULE' };
      }

      if (now < startTime || now > endTime) {
        return { skipped: true, reason: 'NOT_STARTED_YET' };
      }

      const result = await this.sendScheduledMaintenanceStartEmailsToAllUsers(maintenance);

      config.maintenance.scheduledStartEmailSentAt = new Date();
      await config.save();

      require('../utils/config-cache').clearCache();

      return { skipped: false, result };
    } catch (error) {
      console.error('Error processing scheduled maintenance start notifications:', error);
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
   * Generate maintenance finished email HTML
   */
  generateMaintenanceFinishedEmailHtml(userName) {
    const branding = this.getEmailBranding();
    const safeUserName = this.escapeHtml(userName || 'there');

    const bodyHtml = `
      <p style="margin:0 0 16px 0; font-size:16px; line-height:1.7; color:#334155;">You’re all set — everything is running normally again.</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse; margin:0 0 18px 0;">
        <tr>
          <td style="background:#ecfdf5; border:1px solid #bbf7d0; border-left:4px solid #16a34a; border-radius:14px; padding:18px; font-family: Arial, Helvetica, sans-serif; color:#14532d;">
            <div style="font-size:13px; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:8px; color:#15803d;">Status</div>
            <div style="font-size:16px; line-height:1.7; font-weight:700;">The platform is live and ready whenever you are.</div>
          </td>
        </tr>
      </table>
      <p style="margin:0; font-size:16px; line-height:1.7; color:#334155;">If you were waiting to jump back in, you can head straight back to AirLux now.</p>
    `;

    return this.buildEmailShell({
      accentColor: '#16a34a',
      preheader: 'AirLux maintenance is complete and the system is back online.',
      title: `Hi ${safeUserName}, AirLux is back online ✓`,
      badgeText: 'Maintenance complete',
      introHtml: 'Thanks for hanging in there while we finished the update.',
      bodyHtml,
      ctaLabel: 'Go to AirLux',
      ctaHref: branding.appUrl,
      footerNote: 'Thanks for bearing with us — if anything feels off, we’re just an email away.',
      borderColor: '#bbf7d0',
    });
  }

  /**
   * Send maintenance finished emails to all users
   */
  async sendMaintenanceFinishedEmailsToAllUsers() {
    try {
      const transporter = this.getEmailTransporter();
      const users = await this.getMaintenanceRecipients();
      const emailUsers = users.filter((user) => typeof user.email === 'string' && user.email.trim());

      if (emailUsers.length === 0) {
        console.log('No non-super-admin users with email found for maintenance finished notification');
        return { sent: 0, failed: 0, errors: [] };
      }

      let sent = 0;
      let failed = 0;
      const errors = [];

      for (const user of emailUsers) {
        try {
          const html = this.generateMaintenanceFinishedEmailHtml(user.fullName);

          await transporter.sendMail({
            from: `AirLux <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: 'AirLux is back online ✓',
            html,
          });

          sent++;
        } catch (error) {
          failed++;
          errors.push({
            email: user.email,
            error: error.message,
          });
          console.error(`Failed to send maintenance finished email to ${user.email}:`, error);
        }
      }

      return { sent, failed, errors, total: emailUsers.length };
    } catch (error) {
      console.error('Error sending maintenance finished emails:', error);
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

  /**
   * Send maintenance finished notifications (email and in-app)
   */
  async sendMaintenanceFinishedNotifications() {
    const results = {
      emails: null,
      notifications: null,
      errors: [],
    };

    try {
      // Send emails
      try {
        results.emails = await this.sendMaintenanceFinishedEmailsToAllUsers();
        console.log('Maintenance finished emails sent:', results.emails);
      } catch (error) {
        console.error('Error sending maintenance finished emails:', error);
        results.errors.push({
          type: 'EMAIL_SEND_FAILED',
          message: error.message,
        });
      }

      // Create notifications
      try {
        results.notifications = await this.createMaintenanceFinishedNotificationsForAllUsers();
        console.log('Maintenance finished notifications created:', results.notifications);
      } catch (error) {
        console.error('Error creating maintenance finished notifications:', error);
        results.errors.push({
          type: 'NOTIFICATION_CREATE_FAILED',
          message: error.message,
        });
      }
    } catch (error) {
      console.error('Error sending maintenance finished notifications:', error);
      results.errors.push({
        type: 'NOTIFICATION_SERVICE_ERROR',
        message: error.message,
      });
    }

    return results;
  }

  /**
   * Create maintenance finished notifications for all users
   */
  async createMaintenanceFinishedNotificationsForAllUsers() {
    try {
      const users = await this.getMaintenanceRecipients();

      if (users.length === 0) {
        console.log('No non-super-admin users found for maintenance finished notification');
        return { created: 0, failed: 0 };
      }

      let created = 0;
      let failed = 0;

      for (const user of users) {
        try {
          await User.findByIdAndUpdate(
            user._id,
            {
              $push: {
                notifications: {
                  type: 'general',
                  title: 'System Maintenance Complete',
                  message: 'The scheduled system maintenance has been completed successfully. The system is now online.',
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
          console.error(`Failed to create maintenance finished notification for user ${user._id}:`, error);
        }
      }

      return { created, failed, total: users.length };
    } catch (error) {
      console.error('Error creating maintenance finished notifications:', error);
      throw error;
    }
  }
}

module.exports = new MaintenanceNotificationService();
