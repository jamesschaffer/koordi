import nodemailer from 'nodemailer';

// Email service configuration
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@koordi.app';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Create transporter based on environment
function createTransporter() {
  if (process.env.SMTP_HOST) {
    // Production SMTP (SendGrid, AWS SES, etc.)
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } else {
    // Development: Log emails to console instead of sending
    console.log('⚠️  Email service running in development mode - emails will be logged to console');
    return nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true,
    });
  }
}

const transporter = createTransporter();

/**
 * Send invitation email
 */
export async function sendInvitationEmail(data: {
  to: string;
  invitedBy: string;
  calendarName: string;
  childName: string;
  invitationToken: string;
}) {
  const invitationUrl = `${FRONTEND_URL}/invitations/accept/${data.invitationToken}`;

  const subject = `${data.invitedBy} invited you to join "${data.calendarName}" on Koordi`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Calendar Invitation</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f8f9fa; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
        <h1 style="color: #2563eb; margin-top: 0;">You're Invited to Koordi!</h1>
        <p style="font-size: 16px; margin-bottom: 20px;">
          <strong>${data.invitedBy}</strong> has invited you to join the <strong>"${data.calendarName}"</strong> calendar for <strong>${data.childName}</strong>.
        </p>
        <p style="font-size: 14px; color: #666;">
          Koordi helps families coordinate schedules by automatically calculating departure times, managing event assignments, and keeping everyone in sync.
        </p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${invitationUrl}" style="display: inline-block; background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
          Accept Invitation
        </a>
      </div>

      <div style="background-color: #f8f9fa; border-left: 4px solid #2563eb; padding: 15px; margin: 20px 0;">
        <p style="margin: 0; font-size: 14px;">
          <strong>What you'll be able to do:</strong>
        </p>
        <ul style="margin: 10px 0; padding-left: 20px; font-size: 14px;">
          <li>View all events for ${data.childName}</li>
          <li>Assign events to yourself or other parents</li>
          <li>Get automatic drive time calculations</li>
          <li>See events in your Google Calendar</li>
        </ul>
      </div>

      <div style="border-top: 1px solid #e5e7eb; padding-top: 20px; margin-top: 30px;">
        <p style="font-size: 12px; color: #6b7280; margin: 5px 0;">
          This invitation was sent to ${data.to}
        </p>
        <p style="font-size: 12px; color: #6b7280; margin: 5px 0;">
          If you weren't expecting this invitation, you can safely ignore this email.
        </p>
        <p style="font-size: 12px; color: #6b7280; margin: 5px 0;">
          Link expires in 30 days.
        </p>
      </div>
    </body>
    </html>
  `;

  const text = `
${data.invitedBy} invited you to join Koordi!

You've been invited to join the "${data.calendarName}" calendar for ${data.childName}.

Accept invitation: ${invitationUrl}

What you'll be able to do:
- View all events for ${data.childName}
- Assign events to yourself or other parents
- Get automatic drive time calculations
- See events in your Google Calendar

This invitation was sent to ${data.to}
If you weren't expecting this invitation, you can safely ignore this email.
Link expires in 30 days.
  `.trim();

  const mailOptions = {
    from: EMAIL_FROM,
    to: data.to,
    subject,
    text,
    html,
  };

  try {
    if (process.env.SMTP_HOST) {
      // Production: Actually send the email
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Invitation email sent to ${data.to}:`, info.messageId);
      return { success: true, messageId: info.messageId };
    } else {
      // Development: Log email to console
      console.log('\n📧 ========== INVITATION EMAIL (DEV MODE) ==========');
      console.log(`To: ${data.to}`);
      console.log(`Subject: ${subject}`);
      console.log(`\nInvitation URL: ${invitationUrl}\n`);
      console.log('===================================================\n');
      return { success: true, messageId: 'dev-mode', devUrl: invitationUrl };
    }
  } catch (error) {
    console.error('Failed to send invitation email:', error);
    throw new Error('Failed to send invitation email');
  }
}

/**
 * Send invitation accepted notification to calendar owner
 */
export async function sendInvitationAcceptedEmail(data: {
  to: string;
  acceptedBy: string;
  acceptedByEmail: string;
  calendarName: string;
  childName: string;
}) {
  const subject = `${data.acceptedBy} accepted your invitation to "${data.calendarName}"`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invitation Accepted</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #f0fdf4; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
        <h1 style="color: #16a34a; margin-top: 0;">✓ Invitation Accepted</h1>
        <p style="font-size: 16px; margin-bottom: 20px;">
          <strong>${data.acceptedBy}</strong> (${data.acceptedByEmail}) has joined the <strong>"${data.calendarName}"</strong> calendar for <strong>${data.childName}</strong>.
        </p>
        <p style="font-size: 14px; color: #666;">
          They can now view events, assign themselves to events, and collaborate with you on managing ${data.childName}'s schedule.
        </p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${FRONTEND_URL}/calendars" style="display: inline-block; background-color: #2563eb; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
          View Calendar
        </a>
      </div>
    </body>
    </html>
  `;

  const text = `
${data.acceptedBy} accepted your invitation!

${data.acceptedBy} (${data.acceptedByEmail}) has joined the "${data.calendarName}" calendar for ${data.childName}.

They can now view events, assign themselves to events, and collaborate with you on managing ${data.childName}'s schedule.

View calendar: ${FRONTEND_URL}/calendars
  `.trim();

  const mailOptions = {
    from: EMAIL_FROM,
    to: data.to,
    subject,
    text,
    html,
  };

  try {
    if (process.env.SMTP_HOST) {
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Acceptance notification sent to ${data.to}:`, info.messageId);
      return { success: true, messageId: info.messageId };
    } else {
      console.log('\n📧 ========== ACCEPTANCE EMAIL (DEV MODE) ==========');
      console.log(`To: ${data.to}`);
      console.log(`Subject: ${subject}`);
      console.log('====================================================\n');
      return { success: true, messageId: 'dev-mode' };
    }
  } catch (error) {
    console.error('Failed to send acceptance notification:', error);
    // Don't throw - this is a non-critical notification
    return { success: false };
  }
}

/**
 * Send invitation declined notification to calendar owner
 */
export async function sendInvitationDeclinedEmail(data: {
  to: string;
  declinedBy: string;
  declinedByEmail: string;
  calendarName: string;
}) {
  const subject = `${data.declinedBy} declined your invitation to "${data.calendarName}"`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Invitation Declined</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background-color: #fef2f2; border-radius: 8px; padding: 30px; margin-bottom: 20px;">
        <h1 style="color: #dc2626; margin-top: 0;">Invitation Declined</h1>
        <p style="font-size: 16px; margin-bottom: 20px;">
          <strong>${data.declinedBy}</strong> (${data.declinedByEmail}) has declined your invitation to join the <strong>"${data.calendarName}"</strong> calendar.
        </p>
        <p style="font-size: 14px; color: #666;">
          You can send them another invitation later if needed.
        </p>
      </div>
    </body>
    </html>
  `;

  const text = `
${data.declinedBy} declined your invitation

${data.declinedBy} (${data.declinedByEmail}) has declined your invitation to join the "${data.calendarName}" calendar.

You can send them another invitation later if needed.
  `.trim();

  const mailOptions = {
    from: EMAIL_FROM,
    to: data.to,
    subject,
    text,
    html,
  };

  try {
    if (process.env.SMTP_HOST) {
      const info = await transporter.sendMail(mailOptions);
      console.log(`✅ Decline notification sent to ${data.to}:`, info.messageId);
      return { success: true, messageId: info.messageId };
    } else {
      console.log('\n📧 ========== DECLINE EMAIL (DEV MODE) ==========');
      console.log(`To: ${data.to}`);
      console.log(`Subject: ${subject}`);
      console.log('==================================================\n');
      return { success: true, messageId: 'dev-mode' };
    }
  } catch (error) {
    console.error('Failed to send decline notification:', error);
    // Don't throw - this is a non-critical notification
    return { success: false };
  }
}
