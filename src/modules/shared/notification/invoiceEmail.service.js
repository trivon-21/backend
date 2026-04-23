const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
});

const fmt = (n) => Number(n || 0).toLocaleString();
const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { weekday:"long", year:"numeric", month:"long", day:"numeric" });

// Send invoice with PDF to customer
const sendInvoiceEmail = async (email, name, invoiceNum, total, acceptLink, pdfBuffer) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Finance" <${process.env.EMAIL_USER}>`,
      to:   email,
      subject: `Invoice ${invoiceNum} - AirLux`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#1e3a2a;color:white;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="margin:0;">AirLux - Invoice ${invoiceNum}</h2>
          </div>
          <div style="background:white;border:1px solid #e5e7eb;padding:20px;border-radius:0 0 8px 8px;">
            <p>Dear ${name},</p>
            <p>Please find your invoice attached to this email.</p>
            <div style="background:#f0fdf4;border-left:4px solid #2d5a3d;padding:16px;margin:16px 0;border-radius:4px;">
              <p style="margin:0;"><strong>Invoice Number:</strong> ${invoiceNum}</p>
              <p style="margin:8px 0 0;"><strong>Grand Total:</strong> LKR ${fmt(total)}</p>
            </div>
            <p>Please review the invoice and click below to Accept or Reject:</p>
            <a href="${acceptLink}" style="background:#2d5a3d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0;">
              View & Respond to Invoice
            </a>
            <div style="background:#fef9c3;border-left:4px solid #eab308;padding:12px;margin:16px 0;border-radius:4px;font-size:12px;">
              <strong>Important Notes:</strong><br>
              • If accepted, payment must be made within 14 days or the invoice will be auto-cancelled.<br>
              • If rejected, you can cancel rejection within 30 days using the same link.<br>
              • After 30 days of rejection with no action, the order will be permanently closed.
            </div>
            <p>Best regards,<br><strong>AirLux Finance Team</strong></p>
          </div>
        </div>
      `,
      attachments: [{
        filename: `Invoice-${invoiceNum}.pdf`,
        content:  pdfBuffer,
        contentType: "application/pdf",
      }],
    });
    console.log("Invoice email sent to", email);
  } catch (err) { console.error("sendInvoiceEmail error:", err); }
};

// Invoice accepted confirmation
const sendInvoiceAcceptedEmail = async (email, name, invoiceNum, total, paymentDeadline, slipLink) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Finance" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Invoice Accepted - Order Confirmed! - ${invoiceNum}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#1e3a2a;">Thank You for Accepting! ✓</h2>
          <p>Dear ${name},</p>
          <p>Your invoice <strong>${invoiceNum}</strong> has been accepted. Thank you for choosing AirLux!</p>
          <div style="background:#f0fdf4;border-left:4px solid #2d5a3d;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;"><strong>Amount to Pay:</strong> LKR ${fmt(total)}</p>
            <p style="margin:8px 0 0;"><strong>Payment Deadline:</strong> ${fmtDate(paymentDeadline)}</p>
          </div>
          <p>Please complete payment and upload your slip using the link below:</p>
          <a href="${slipLink}" style="background:#2d5a3d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0;">
            Upload Payment Slip
          </a>
          <p style="color:#dc2626;font-size:12px;">
            ⚠️ If payment is not received within 14 days, the invoice will be automatically cancelled.
          </p>
          <p>Our installation team will contact you after payment confirmation.</p>
          <p>Best regards,<br><strong>AirLux Team</strong></p>
        </div>
      `,
    });
  } catch (err) { console.error("sendInvoiceAcceptedEmail error:", err); }
};

// Invoice rejected email to customer
const sendInvoiceRejectedEmail = async (email, name, invoiceNum, reason, deadline, cancelLink) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Finance" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Invoice Rejected - ${invoiceNum}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#1e3a2a;">Invoice Rejection Recorded</h2>
          <p>Dear ${name},</p>
          <p>Your rejection for invoice <strong>${invoiceNum}</strong> has been recorded.</p>
          <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:16px;margin:16px 0;border-radius:4px;">
            <strong>Rejection Reason:</strong> ${reason}
          </div>
          <div style="background:#fef9c3;border-left:4px solid #eab308;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;"><strong>You can cancel this rejection until:</strong> ${fmtDate(deadline)}</p>
            <p style="margin:8px 0 0;font-size:12px;">After this date, the order will be permanently closed.</p>
          </div>
          <p>Changed your mind? Cancel rejection here:</p>
          <a href="${cancelLink}" style="background:#2d5a3d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0;">
            Cancel Rejection & Accept Invoice
          </a>
          <p>Best regards,<br><strong>AirLux Team</strong></p>
        </div>
      `,
    });
  } catch (err) { console.error("sendInvoiceRejectedEmail error:", err); }
};

// 2-day warning before rejection expires
const sendRejectionWarningEmail = async (email, name, invoiceNum, daysLeft) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Finance" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `⚠️ ${daysLeft} Day(s) Left to Cancel Rejection - ${invoiceNum}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#dc2626;">⚠️ Action Required</h2>
          <p>Dear ${name},</p>
          <p>Your rejection for invoice <strong>${invoiceNum}</strong> will expire in <strong>${daysLeft} day(s)</strong>.</p>
          <p>After expiry, your order will be <strong>permanently closed</strong> with no possibility of recovery.</p>
          <p>If you wish to proceed with the installation, please cancel your rejection immediately.</p>
          <p>Best regards,<br><strong>AirLux Team</strong></p>
        </div>
      `,
    });
  } catch (err) { console.error("sendRejectionWarningEmail error:", err); }
};

// Rejection expired — permanently closed
const sendRejectionExpiredEmail = async (email, name, invoiceNum) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Finance" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Order Permanently Closed - ${invoiceNum}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#dc2626;">Order Permanently Closed</h2>
          <p>Dear ${name},</p>
          <p>The rejection period for invoice <strong>${invoiceNum}</strong> has expired.</p>
          <p>Your order has been permanently closed. There is no possibility of recovery.</p>
          <p>If you wish to proceed with installation in the future, please place a new order.</p>
          <p>Best regards,<br><strong>AirLux Team</strong></p>
        </div>
      `,
    });
  } catch (err) { console.error("sendRejectionExpiredEmail error:", err); }
};

// 2-day payment reminder
const sendPaymentReminderEmail = async (email, name, invoiceNum, total, daysLeft) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Finance" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `⚠️ Payment Due in ${daysLeft} Day(s) - ${invoiceNum}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#f59e0b;">⚠️ Payment Reminder</h2>
          <p>Dear ${name},</p>
          <p>Your payment of <strong>LKR ${fmt(total)}</strong> for invoice <strong>${invoiceNum}</strong> is due in <strong>${daysLeft} day(s)</strong>.</p>
          <p>If payment is not received by the deadline, your invoice will be <strong>automatically cancelled</strong>.</p>
          <p>Best regards,<br><strong>AirLux Finance Team</strong></p>
        </div>
      `,
    });
  } catch (err) { console.error("sendPaymentReminderEmail error:", err); }
};

// Auto cancelled email
const sendAutoCancelledEmail = async (email, name, invoiceNum) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Finance" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Invoice Auto-Cancelled - ${invoiceNum}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#dc2626;">Invoice Auto-Cancelled</h2>
          <p>Dear ${name},</p>
          <p>Your invoice <strong>${invoiceNum}</strong> has been automatically cancelled due to non-payment within the 14-day payment window.</p>
          <p>If you wish to proceed with the installation, please contact our team to restart the process.</p>
          <p>Best regards,<br><strong>AirLux Finance Team</strong></p>
        </div>
      `,
    });
  } catch (err) { console.error("sendAutoCancelledEmail error:", err); }
};

module.exports = {
  sendInvoiceEmail, sendInvoiceAcceptedEmail, sendInvoiceRejectedEmail,
  sendRejectionWarningEmail, sendRejectionExpiredEmail,
  sendPaymentReminderEmail, sendAutoCancelledEmail,
};