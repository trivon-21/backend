const nodemailer = require('nodemailer');
function mailIsDisabled() {
  return process.env.DEMO_MODE === 'true' || process.env.MAIL_MODE === 'log';
}
function createTransport(options) {
  // Build messages in memory in demo mode; never contact SMTP or log tokens/passwords.
  return nodemailer.createTransport(mailIsDisabled() ? { jsonTransport: true } : options);
}
module.exports = { createTransport, mailIsDisabled };
