const nodemailer = require('nodemailer');
const logger = require('../utils/logger');

/**
 * Email Service — Sends order confirmation email directly via SMTP.
 * Delivers in 2-5 seconds (instant) compared to Shopify's queued system.
 * 
 * Supports: Gmail, Outlook, Yahoo, or any custom SMTP server.
 * 
 * Configuration via .env:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_USER=your-email@gmail.com
 *   SMTP_PASS=xxxx-xxxx-xxxx-xxxx  (Gmail App Password)
 *   SMTP_FROM_NAME=Your Store Name
 *   SMTP_FROM_EMAIL=your-email@gmail.com
 */

let transporter = null;

/**
 * Initialize the SMTP transporter.
 * Called once on first use (lazy init).
 */
function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    logger.info('SMTP not configured — email sending disabled. Set SMTP_HOST, SMTP_USER, SMTP_PASS in .env');
    return null;
  }

  transporter = nodemailer.createTransport({
    host: host,
    port: port,
    secure: port === 465,
    auth: {
      user: user,
      pass: pass
    }
  });

  logger.info(`SMTP configured: ${user} via ${host}:${port}`);
  return transporter;
}

/**
 * Send order confirmation email to customer.
 * Returns true if sent, false if SMTP not configured.
 */
async function sendOrderEmail(customerData, orderId, draftOrderId) {
  const transport = getTransporter();
  
  if (!transport) {
    logger.info(`SMTP not configured — skipping email to ${customerData.email}`);
    return false;
  }

  const fromName = process.env.SMTP_FROM_NAME || 'Order Confirmation';
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  const emailHtml = buildOrderEmailHtml(customerData, orderId);

  const mailOptions = {
    from: `"${fromName}" <${fromEmail}>`,
    to: customerData.email,
    subject: `Order Confirmation #${orderId} — ${customerData.product_name}`,
    html: emailHtml
  };

  try {
    logger.info(`📧 Sending email to ${customerData.email} via SMTP...`);

    const info = await transport.sendMail(mailOptions);

    logger.info(`✅ Email SENT to ${customerData.email}`, {
      messageId: info.messageId,
      order_id: orderId,
      response: info.response
    });

    return true;
  } catch (error) {
    logger.error('sendOrderEmail', `Failed to send email to ${customerData.email}`, {
      error: error.message,
      order_id: orderId
    });
    // Don't throw — email failure should not break the order flow
    return false;
  }
}

/**
 * Build a professional order confirmation email in HTML.
 */
function buildOrderEmailHtml(data, orderId) {
  const firstName = data.first_name || 'Customer';
  const lastName = data.last_name || '';
  const productName = data.product_name || 'Your Product';
  const productPrice = data.product_price || '0.00';
  const email = data.email || '';
  const address = data.address_line || '';
  const city = data.city || '';
  const state = data.state || '';
  const postalCode = data.postal_code || '';
  const country = data.country || '';
  const phone = data.phone || '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f6f6f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f6f6f6; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding:32px 40px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:24px; font-weight:600;">
                ✅ Order Confirmed!
              </h1>
              <p style="color:rgba(255,255,255,0.85); margin:8px 0 0; font-size:14px;">
                Order #${orderId}
              </p>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="padding:32px 40px 16px;">
              <p style="color:#333; font-size:16px; margin:0; line-height:1.6;">
                Hi <strong>${firstName}</strong>,
              </p>
              <p style="color:#555; font-size:14px; margin:8px 0 0; line-height:1.6;">
                Thank you for your order! Your payment has been received and your order is confirmed.
              </p>
            </td>
          </tr>

          <!-- Order Details -->
          <tr>
            <td style="padding:16px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa; border-radius:8px; padding:20px;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="color:#333; font-size:14px; margin:0 0 16px; text-transform:uppercase; letter-spacing:1px;">
                      Order Summary
                    </h3>
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:8px 0; color:#333; font-size:14px; border-bottom:1px solid #e9ecef;">
                          ${productName}
                        </td>
                        <td style="padding:8px 0; color:#333; font-size:14px; text-align:right; border-bottom:1px solid #e9ecef; font-weight:600;">
                          $${productPrice}
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:8px 0; color:#333; font-size:14px;">
                          Quantity
                        </td>
                        <td style="padding:8px 0; color:#333; font-size:14px; text-align:right;">
                          1
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0 0; color:#333; font-size:16px; font-weight:700; border-top:2px solid #333;">
                          Total
                        </td>
                        <td style="padding:12px 0 0; color:#333; font-size:16px; font-weight:700; text-align:right; border-top:2px solid #333;">
                          $${productPrice}
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Shipping Address -->
          <tr>
            <td style="padding:16px 40px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8f9fa; border-radius:8px;">
                <tr>
                  <td style="padding:20px;">
                    <h3 style="color:#333; font-size:14px; margin:0 0 12px; text-transform:uppercase; letter-spacing:1px;">
                      Shipping Address
                    </h3>
                    <p style="color:#555; font-size:14px; margin:0; line-height:1.8;">
                      ${firstName} ${lastName}<br>
                      ${address ? address + '<br>' : ''}
                      ${city ? city + ', ' : ''}${state} ${postalCode}<br>
                      ${country}
                      ${phone ? '<br>📞 ' + phone : ''}
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Payment Status -->
          <tr>
            <td style="padding:16px 40px;" align="center">
              <div style="display:inline-block; background:#d4edda; color:#155724; padding:10px 24px; border-radius:20px; font-size:14px; font-weight:600;">
                💳 Payment Status: PAID
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:32px 40px; border-top:1px solid #e9ecef; text-align:center;">
              <p style="color:#999; font-size:12px; margin:0; line-height:1.6;">
                If you have any questions about your order, please reply to this email.
              </p>
              <p style="color:#bbb; font-size:11px; margin:12px 0 0;">
                Order #${orderId} • ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Check if SMTP is configured.
 */
function isSmtpConfigured() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

module.exports = { sendOrderEmail, isSmtpConfigured };
