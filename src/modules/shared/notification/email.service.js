const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const formatDate = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
};

// Rejection email
const sendRejectionEmail = async (email, orderId, reason, reuploadLink) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Finance Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Payment Rejected - Order ${orderId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#1e3a2a;">AirLux - Inspection Payment Rejected</h2>
          <p>Dear Customer,</p>
          <p>Your inspection payment for <strong>Order ${orderId}</strong> has been rejected.</p>
          <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;border-radius:4px;">
            <strong>Reason:</strong> ${reason}
          </div>
          <p>Please re-upload your payment slip using the link below:</p>
          <a href="${reuploadLink}"
            style="background:#2d5a3d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0;">
            Re-upload Payment Slip
          </a>
          <p>Best regards,<br><strong>AirLux Finance Team</strong></p>
        </div>
      `,
    });
    console.log("Rejection email sent to", email);
  } catch (error) {
    console.error("Rejection email error:", error);
  }
};

// Approval email with scheduling link
const sendApprovalEmail = async (email, orderId, customerName, schedulingLink) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Finance Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Inspection Payment Verified - Order ${orderId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#1e3a2a;">AirLux - Inspection Payment Verified ✓</h2>
          <p>Dear ${customerName},</p>
          <p>Your inspection payment for <strong>Order ${orderId}</strong> has been verified successfully!</p>
          <p>You can now schedule your inspection by clicking the link below:</p>
          <a href="${schedulingLink}"
            style="background:#2d5a3d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0;">
            Schedule Your Inspection
          </a>
          <p>Please select a convenient date within the next 30 days.</p>
          <p>Best regards,<br><strong>AirLux Team</strong></p>
        </div>
      `,
    });
    console.log("Approval email sent to", email);
  } catch (error) {
    console.error("Approval email error:", error);
  }
};

// Scheduling confirmation email
const sendSchedulingEmail = async (email, customerName, orderId, scheduledDate, ticketId, rescheduleLink) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Inspection Scheduled - Order ${orderId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#1e3a2a;">AirLux - Inspection Scheduled ✓</h2>
          <p>Dear ${customerName},</p>
          <p>Your inspection has been successfully scheduled!</p>
          <div style="background:#f0fdf4;border-left:4px solid #2d5a3d;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;"><strong>Order ID:</strong> ${orderId}</p>
            <p style="margin:8px 0 0;"><strong>Inspection Date:</strong> ${formatDate(scheduledDate)}</p>
          </div>
          <p>Our inspection team will visit your site on the scheduled date.</p>
          <p>Please ensure someone is available at the site on that day.</p>
          <p style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;">
            <strong>Need to reschedule?</strong> You can change your inspection date up to 1 day before the scheduled date using the link below:
          </p>
          <a href="${rescheduleLink}"
            style="background:#2d5a3d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:12px 0;">
            Reschedule Inspection
          </a>
          <p>Best regards,<br><strong>AirLux Team</strong></p>
        </div>
      `,
    });
    console.log("Scheduling email sent to", email);
  } catch (error) {
    console.error("Scheduling email error:", error);
  }
};

// Reminder email (sent 1 day before)
const sendReminderEmail = async (email, customerName, orderId, scheduledDate) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Reminder: Inspection Tomorrow - Order ${orderId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#1e3a2a;">AirLux - Inspection Reminder 🔔</h2>
          <p>Dear ${customerName},</p>
          <p>This is a friendly reminder that your inspection is scheduled for <strong>tomorrow</strong>.</p>
          <div style="background:#f0fdf4;border-left:4px solid #2d5a3d;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;"><strong>Order ID:</strong> ${orderId}</p>
            <p style="margin:8px 0 0;"><strong>Inspection Date:</strong> ${formatDate(scheduledDate)}</p>
          </div>
          <p>Please ensure:</p>
          <ul>
            <li>Someone is available at the site</li>
            <li>The inspection area is accessible</li>
            <li>Any pets are secured</li>
          </ul>
          <p>Best regards,<br><strong>AirLux Team</strong></p>
        </div>
      `,
    });
    console.log("Reminder email sent to", email);
  } catch (error) {
    console.error("Reminder email error:", error);
  }
};

// Arrival time notification email
const sendArrivalEmail = async (email, customerName, orderId, inspectionDate, arrivalTime) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Inspection Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Inspection Team Arriving Today - Order ${orderId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#1e3a2a;">AirLux - Inspection Team On The Way 🚗</h2>
          <p>Dear ${customerName},</p>
          <p>Your inspection team is on their way to your site today!</p>
          <div style="background:#f0fdf4;border-left:4px solid #2d5a3d;padding:16px;margin:16px 0;border-radius:4px;">
            <p style="margin:0;"><strong>Order ID:</strong> ${orderId}</p>
            <p style="margin:8px 0 0;"><strong>Inspection Date:</strong> ${formatDate(inspectionDate)}</p>
            <p style="margin:8px 0 0;"><strong>Expected Arrival Time:</strong> ${arrivalTime}</p>
          </div>
          <p>Please ensure someone is available at the site.</p>
          <p>Best regards,<br><strong>AirLux Inspection Team</strong></p>
        </div>
      `,
    });
    console.log("Arrival email sent to", email);
  } catch (error) {
    console.error("Arrival email error:", error);
  }
};

// Send report to main technician
const sendReportToTechnician = async (techEmail, report, orderId, ticketId) => {
  try {
    const roomsHtml = (report.rooms || []).map((room, i) => `
      <div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:12px 0;">
        <h4 style="color:#1e3a2a;margin:0 0 12px;font-size:15px;border-bottom:1px solid #e5e7eb;padding-bottom:8px;">
          Room ${i + 1}: ${room.name || 'Unnamed'}
        </h4>

        <h5 style="color:#374151;margin:10px 0 6px;font-size:13px;">Room / Area Details</h5>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          <tr><td style="padding:3px 8px;color:#6b7280;width:45%;">Dimensions (L×W×H)</td>
              <td style="padding:3px 8px;">${room.length || '-'}m × ${room.width || '-'}m × ${room.height || '-'}m</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:3px 8px;color:#6b7280;">Area</td>
              <td style="padding:3px 8px;">${room.area || '-'} sq m</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">Sun Exposure</td>
              <td style="padding:3px 8px;">${room.sunExposure || '-'}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:3px 8px;color:#6b7280;">Ventilation</td>
              <td style="padding:3px 8px;">${room.ventilation || '-'}</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">No. of Windows</td>
              <td style="padding:3px 8px;">${room.windows || '-'}</td></tr>
        </table>

        <h5 style="color:#374151;margin:10px 0 6px;font-size:13px;">Installation Locations</h5>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          <tr><td style="padding:3px 8px;color:#6b7280;width:45%;">Possible Wall Locations</td>
              <td style="padding:3px 8px;">${room.possibleWallLocations || '-'}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:3px 8px;color:#6b7280;">Wall Condition</td>
              <td style="padding:3px 8px;">${room.wallCondition || '-'}</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">Space Availability</td>
              <td style="padding:3px 8px;">${room.spaceAvailability || '-'}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:3px 8px;color:#6b7280;">Outdoor Locations</td>
              <td style="padding:3px 8px;">${room.outdoorAvailableLocations || '-'}</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">Surface Condition</td>
              <td style="padding:3px 8px;">${room.surfaceCondition || '-'}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:3px 8px;color:#6b7280;">Ventilation Condition</td>
              <td style="padding:3px 8px;">${room.ventilationCondition || '-'}</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">Exposure to Weather</td>
              <td style="padding:3px 8px;">${room.exposureToWeather || '-'}</td></tr>
        </table>

        <h5 style="color:#374151;margin:10px 0 6px;font-size:13px;">Distance & Routing</h5>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          <tr><td style="padding:3px 8px;color:#6b7280;width:45%;">Indoor-Outdoor Distance</td>
              <td style="padding:3px 8px;">${room.indoorOutdoorDistance || '-'}m (${room.distanceMeasured || ''})</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:3px 8px;color:#6b7280;">Routing Path</td>
              <td style="padding:3px 8px;">${room.possibleRoutingPath || '-'}</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">Routing Description</td>
              <td style="padding:3px 8px;">${room.routingPathDescription || '-'}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:3px 8px;color:#6b7280;">Estimated Bends</td>
              <td style="padding:3px 8px;">${room.estimatedBends || '-'}</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">Drain Outlet Available</td>
              <td style="padding:3px 8px;">${room.drainOutletAvailable ? 'Yes' : 'No'}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:3px 8px;color:#6b7280;">Drain Type</td>
              <td style="padding:3px 8px;">${room.drainType || '-'}</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">Drain Path Description</td>
              <td style="padding:3px 8px;">${room.drainPathDescription || '-'}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:3px 8px;color:#6b7280;">Obstacles</td>
              <td style="padding:3px 8px;">${(room.obstacles || []).join(', ') || '-'}</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">Obstacle Details</td>
              <td style="padding:3px 8px;">${room.obstacleDetails || '-'}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:3px 8px;color:#6b7280;">Wall Drilling Required</td>
              <td style="padding:3px 8px;">${room.wallDrillingRequired ? 'Yes' : 'No'}</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">Drill Points (Approx.)</td>
              <td style="padding:3px 8px;">${room.drillPoints || '-'}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:3px 8px;color:#6b7280;">Vertical Height Diff</td>
              <td style="padding:3px 8px;">${room.verticalHeightDiff || '-'}m</td></tr>
        </table>

        <h5 style="color:#374151;margin:10px 0 6px;font-size:13px;">Electrical Condition</h5>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          <tr><td style="padding:3px 8px;color:#6b7280;width:45%;">Power Points Nearby</td>
              <td style="padding:3px 8px;">${room.powerPointsNearby ? 'Yes' : 'No'}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:3px 8px;color:#6b7280;">Wiring Condition Visible</td>
              <td style="padding:3px 8px;">${room.wiringConditionVisible ? 'Yes' : 'No'}</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">Earthing Availability</td>
              <td style="padding:3px 8px;">${room.earthingAvailability ? 'Yes' : 'No'}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:3px 8px;color:#6b7280;">Distance to Board</td>
              <td style="padding:3px 8px;">${room.distanceToBoard || '-'}m</td></tr>
          <tr><td style="padding:3px 8px;color:#6b7280;">Electrical Limitations</td>
              <td style="padding:3px 8px;">${room.electricalLimitations || '-'}</td></tr>
        </table>

        <h5 style="color:#374151;margin:10px 0 6px;font-size:13px;">Constraints & Notes</h5>
        <table style="width:100%;font-size:12px;border-collapse:collapse;">
          <tr><td style="padding:3px 8px;color:#6b7280;width:45%;">Constraints & Risks</td>
              <td style="padding:3px 8px;">${room.constraintsRisks || 'None'}</td></tr>
          <tr style="background:#f9fafb;"><td style="padding:3px 8px;color:#6b7280;">Inspector Notes</td>
              <td style="padding:3px 8px;">${room.inspectorNotes || 'None'}</td></tr>
        </table>
      </div>
    `).join('');

    await transporter.sendMail({
      from: `"AirLux Inspection Team" <${process.env.EMAIL_USER}>`,
      to: techEmail,
      subject: `Inspection Report - Order ${orderId} | Ticket ${ticketId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:750px;margin:0 auto;padding:20px;">
          <div style="background:#1e3a2a;color:white;padding:20px 24px;border-radius:8px 8px 0 0;">
            <h2 style="margin:0;font-size:20px;">AirLux Inspection Report</h2>
            <p style="margin:6px 0 0;opacity:0.8;font-size:13px;">Submitted for installation planning</p>
          </div>
          <div style="background:white;border:1px solid #e5e7eb;padding:24px;border-radius:0 0 8px 8px;">

            <div style="background:#f0fdf4;border-left:4px solid #2d5a3d;padding:14px 16px;margin-bottom:20px;border-radius:4px;">
              <p style="margin:0;font-size:13px;"><strong>Order ID:</strong> ${orderId}</p>
              <p style="margin:6px 0 0;font-size:13px;"><strong>Ticket ID:</strong> ${ticketId}</p>
            </div>

            <h3 style="color:#1e3a2a;font-size:15px;margin:0 0 12px;">1. Customer & Site Details</h3>
            <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:20px;">
              <tr><td style="padding:5px 8px;color:#6b7280;width:35%;">Customer Name</td>
                  <td style="padding:5px 8px;">${report.customerName || '-'}</td></tr>
              <tr style="background:#f9fafb;"><td style="padding:5px 8px;color:#6b7280;">Contact Number</td>
                  <td style="padding:5px 8px;">${report.contactNumber || '-'}</td></tr>
              <tr><td style="padding:5px 8px;color:#6b7280;">Site Address</td>
                  <td style="padding:5px 8px;">${report.siteAddress || '-'}</td></tr>
              <tr style="background:#f9fafb;"><td style="padding:5px 8px;color:#6b7280;">Site Type</td>
                  <td style="padding:5px 8px;">${report.siteType || '-'}</td></tr>
              <tr><td style="padding:5px 8px;color:#6b7280;">Inspection Date</td>
                  <td style="padding:5px 8px;">${report.inspectionDate || '-'}</td></tr>
            </table>

            <h3 style="color:#1e3a2a;font-size:15px;margin:0 0 12px;">2. General Site Information</h3>
            <table style="width:100%;font-size:13px;border-collapse:collapse;margin-bottom:20px;">
              <tr><td style="padding:5px 8px;color:#6b7280;width:35%;">Site Status</td>
                  <td style="padding:5px 8px;">${report.siteStatus || '-'}</td></tr>
              <tr style="background:#f9fafb;"><td style="padding:5px 8px;color:#6b7280;">Floor Level</td>
                  <td style="padding:5px 8px;">${report.floorLevel || '-'}</td></tr>
              <tr><td style="padding:5px 8px;color:#6b7280;">Elevator Availability</td>
                  <td style="padding:5px 8px;">${report.elevatorAvailability ? 'Available' : 'Not Available'}</td></tr>
              <tr style="background:#f9fafb;"><td style="padding:5px 8px;color:#6b7280;">Parking Availability</td>
                  <td style="padding:5px 8px;">${report.parkingAvailability || '-'}</td></tr>
            </table>

            <h3 style="color:#1e3a2a;font-size:15px;margin:0 0 4px;">
              3-8. Room Details (${(report.rooms || []).length} room(s))
            </h3>
            ${roomsHtml || '<p style="color:#9ca3af;font-size:13px;">No rooms recorded</p>'}

            <h3 style="color:#1e3a2a;font-size:15px;margin:20px 0 12px;">10. Acknowledgement</h3>
            <table style="width:100%;font-size:13px;border-collapse:collapse;">
              <tr><td style="padding:5px 8px;color:#6b7280;width:35%;">Inspector Name</td>
                  <td style="padding:5px 8px;">${report.inspectorName || '-'}</td></tr>
              <tr style="background:#f9fafb;"><td style="padding:5px 8px;color:#6b7280;">Date</td>
                  <td style="padding:5px 8px;">${report.acknowledgeDate || '-'}</td></tr>
              <tr><td style="padding:5px 8px;color:#6b7280;">Time</td>
                  <td style="padding:5px 8px;">${report.acknowledgeTime || '-'}</td></tr>
            </table>

            <p style="margin-top:24px;font-size:11px;color:#9ca3af;border-top:1px solid #f3f4f6;padding-top:12px;">
              This report was submitted from the AirLux Inspection Management System.
              Please review all room details and proceed with material planning and installation scheduling.
            </p>
          </div>
        </div>
      `,
    });
    console.log("Full report submitted to technician:", techEmail);
  } catch (error) {
    console.error("Report email error:", error);
  }
};
// Buy Only — Approval email
const sendBuyOnlyApprovalEmail = async (email, customerName, orderId) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Finance Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Payment Approved - Order ${orderId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#1e3a2a;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;">AirLux</h2>
          </div>
          <div style="background:#f0fdf4;border:1px solid #86efac;padding:20px;margin:16px 0;border-radius:8px;">
            <h3 style="color:#166534;margin:0 0 8px;">Payment Approved!</h3>
            <p style="color:#166534;margin:0;">Your payment has been verified successfully.</p>
          </div>
          <p>Dear <strong>${customerName}</strong>,</p>
          <p>We are pleased to inform you that your payment for <strong>Order ${orderId}</strong> has been approved.</p>
          <p>Our team will be in touch shortly regarding the next steps for your order.</p>
          <p>Thank you for choosing AirLux!</p>
          <p>Best regards,<br><strong>AirLux Finance Team</strong></p>
        </div>
      `,
    });
    console.log("Buy Only approval email sent to", email);
  } catch (error) {
    console.error("Buy Only approval email error:", error);
  }
};

// Buy Only — Rejection email with reupload link
const sendBuyOnlyRejectionEmail = async (email, customerName, orderId, itemName, reason, reuploadLink) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Finance Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Payment Rejected - Order ${orderId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#1e3a2a;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;">AirLux</h2>
          </div>
          <div style="background:#fef2f2;border:1px solid #fca5a5;padding:20px;margin:16px 0;border-radius:8px;">
            <h3 style="color:#dc2626;margin:0 0 8px;">Payment Rejected</h3>
          </div>
          <p>Dear <strong>${customerName}</strong>,</p>
          <p>Unfortunately, your payment for <strong>Order ${orderId}</strong> (${itemName}) has been rejected.</p>
          <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;border-radius:4px;">
            <strong>Reason:</strong> ${reason}
          </div>
          <p>Please re-upload your payment slip using the link below:</p>
          <a href="${reuploadLink}"
            style="background:#2d5a3d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0;">
            Re-upload Payment Slip
          </a>
          <p style="font-size:13px;color:#6b7280;">If the button doesn't work, copy this link: ${reuploadLink}</p>
          <p>Best regards,<br><strong>AirLux Finance Team</strong></p>
        </div>
      `,
    });
    console.log("Buy Only rejection email sent to", email);
  } catch (error) {
    console.error("Buy Only rejection email error:", error);
  }
};

// Service (Repair/Maintenance) — Approval email
const sendServiceApprovalEmail = async (email, customerName, orderId, serviceType) => {
  const label = serviceType === "REPAIR" ? "Repair" : "Maintenance";
  try {
    await transporter.sendMail({
      from: `"AirLux Finance Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `${label} Payment Approved - ${orderId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#1e3a2a;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;">AirLux</h2>
          </div>
          <div style="background:#f0fdf4;border:1px solid #86efac;padding:20px;margin:16px 0;border-radius:8px;">
            <h3 style="color:#166534;margin:0 0 8px;">${label} Payment Approved!</h3>
            <p style="color:#166534;margin:0;">Your payment has been verified successfully.</p>
          </div>
          <p>Dear <strong>${customerName}</strong>,</p>
          <p>Your payment for the <strong>${label} service (${orderId})</strong> has been approved.</p>
          <p>Our team will contact you shortly to schedule the ${label.toLowerCase()} service.</p>
          <p>Best regards,<br><strong>AirLux Finance Team</strong></p>
        </div>
      `,
    });
    console.log(`Service approval email sent to ${email}`);
  } catch (error) {
    console.error("Service approval email error:", error);
  }
};

// Service (Repair/Maintenance) — Rejection email with reupload link
const sendServiceRejectionEmail = async (email, customerName, orderId, serviceType, reason, reuploadLink) => {
  const label = serviceType === "REPAIR" ? "Repair" : "Maintenance";
  try {
    await transporter.sendMail({
      from: `"AirLux Finance Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `${label} Payment Rejected - ${orderId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#1e3a2a;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;">AirLux</h2>
          </div>
          <div style="background:#fef2f2;border:1px solid #fca5a5;padding:20px;margin:16px 0;border-radius:8px;">
            <h3 style="color:#dc2626;margin:0 0 8px;">${label} Payment Rejected</h3>
          </div>
          <p>Dear <strong>${customerName}</strong>,</p>
          <p>Your payment for <strong>${label} service (${orderId})</strong> has been rejected.</p>
          <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;border-radius:4px;">
            <strong>Reason:</strong> ${reason}
          </div>
          <p>Please re-upload your payment slip:</p>
          <a href="${reuploadLink}"
            style="background:#2d5a3d;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0;">
            Re-upload Payment Slip
          </a>
          <p style="font-size:13px;color:#6b7280;">Or copy: ${reuploadLink}</p>
          <p>Best regards,<br><strong>AirLux Finance Team</strong></p>
        </div>
      `,
    });
    console.log(`Service rejection email sent to ${email}`);
  } catch (error) {
    console.error("Service rejection email error:", error);
  }
};
// Purchase Request — Approval email to inventory manager
const sendPurchaseApprovalEmail = async (email, managerName, requestId, totalAmount) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Finance Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Purchase Request Approved - ${requestId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#1e3a2a;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;">AirLux</h2>
          </div>
          <div style="background:#f0fdf4;border:1px solid #86efac;padding:20px;margin:16px 0;border-radius:8px;">
            <h3 style="color:#166534;margin:0 0 8px;">Purchase Request Approved!</h3>
            <p style="color:#166534;margin:0;">Total Amount: LKR ${Number(totalAmount).toLocaleString()}</p>
          </div>
          <p>Dear <strong>${managerName}</strong>,</p>
          <p>Your purchase request <strong>${requestId}</strong> has been approved by the Finance Officer.</p>
          <p>You may proceed with the purchase and payment. Please retain receipts for record-keeping.</p>
          <p>Best regards,<br><strong>AirLux Finance Team</strong></p>
        </div>
      `,
    });
    console.log("Purchase approval email sent to", email);
  } catch (error) {
    console.error("Purchase approval email error:", error);
  }
};

// Purchase Request — Rejection email to inventory manager
const sendPurchaseRejectionEmail = async (email, managerName, requestId, reason) => {
  try {
    await transporter.sendMail({
      from: `"AirLux Finance Team" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: `Purchase Request Rejected - ${requestId}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:#1e3a2a;padding:20px;border-radius:8px 8px 0 0;">
            <h2 style="color:white;margin:0;">AirLux</h2>
          </div>
          <div style="background:#fef2f2;border:1px solid #fca5a5;padding:20px;margin:16px 0;border-radius:8px;">
            <h3 style="color:#dc2626;margin:0 0 8px;">Purchase Request Rejected</h3>
          </div>
          <p>Dear <strong>${managerName}</strong>,</p>
          <p>Your purchase request <strong>${requestId}</strong> has been rejected.</p>
          <div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;margin:16px 0;border-radius:4px;">
            <strong>Reason:</strong> ${reason}
          </div>
          <p>If you believe this needs reconsideration, please contact the Finance Officer directly.</p>
          <p>Best regards,<br><strong>AirLux Finance Team</strong></p>
        </div>
      `,
    });
    console.log("Purchase rejection email sent to", email);
  } catch (error) {
    console.error("Purchase rejection email error:", error);
  }
};
module.exports = {
  sendRejectionEmail,
  sendApprovalEmail,
  sendSchedulingEmail,
  sendReminderEmail,
  sendArrivalEmail,
  sendReportToTechnician,
  sendBuyOnlyApprovalEmail,
  sendBuyOnlyRejectionEmail,
  sendServiceApprovalEmail,
  sendServiceRejectionEmail,
  sendPurchaseApprovalEmail,
  sendPurchaseRejectionEmail,
};