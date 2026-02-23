const nodemailer = require("nodemailer");

console.log("EMAIL_USER:", process.env.EMAIL_USER);
console.log("EMAIL_PASS:", process.env.EMAIL_PASS ? "****" : "MISSING");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendRejectionEmail = async (email, orderId, reason) => {
  try {
    await transporter.sendMail({
      from: `"Finance Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Payment Rejected - Order ${orderId}`,
      html: `
        <h3>Payment Rejected</h3>
        <p><strong>Order ID:</strong> ${orderId}</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <p>Please re-upload your payment slip.</p>
      `,
    });
    console.log("Email sent successfully to", email);
  } catch (error) {
    console.error("Email error:", error);
  }
};

module.exports = { sendRejectionEmail };
