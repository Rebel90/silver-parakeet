const fetch = require('node-fetch');
const { API_VERSION } = require('./shopifyAuth');
const logger = require('../utils/logger');

/**
 * Complete a Draft Order via Shopify REST API.
 * This marks the draft as PAID and creates a real Order.
 * Shopify will automatically send an Order Confirmation email to the customer.
 *
 * PUT /admin/api/{version}/draft_orders/{draft_order_id}/complete.json
 *
 * CRITICAL: payment_pending MUST be in the request BODY (not URL param)
 * - payment_pending: false → Shopify marks as PAID and sends order confirmation email
 * - payment_pending: true  → Shopify does NOT always send email (THIS WAS THE BUG!)
 */
async function completeDraftOrder(shopDomain, accessToken, draftOrderId, email) {

  if (!draftOrderId) throw new Error('draftOrderId is missing');
  if (!accessToken) throw new Error('accessToken is missing');

  // Wait 1000ms after draft order creation to let Shopify process it
  await new Promise(resolve => setTimeout(resolve, 1000));

  const cleanDomain = shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');

  // NO query params — payment_pending goes in the BODY
  const url = `https://${cleanDomain}/admin/api/${API_VERSION}/draft_orders/${draftOrderId}/complete.json`;

  logger.info('=== completeDraftOrder ===');
  logger.info(`URL: ${url}`);
  logger.info(`Draft Order ID: ${draftOrderId}`);
  logger.info(`Customer Email: ${email}`);

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken
    },
    // CRITICAL FIX: payment_pending in BODY, not URL
    body: JSON.stringify({
      payment_pending: false
    })
  });

  const responseText = await response.text();

  logger.info(`Status: ${response.status}`);
  logger.info(`Response: ${responseText.slice(0, 500)}`);

  if (response.status === 429) {
    logger.error('completeDraftOrder', `Rate limited for ${email}`, { status: 429 });
    const err = new Error('Rate limited by Shopify');
    err.statusCode = 429;
    throw err;
  }

  if (!response.ok) {
    logger.error('completeDraftOrder', `Complete failed for ${email}`, {
      status: response.status,
      response: responseText
    });
    throw new Error(`Complete order failed ${response.status}: ${responseText}`);
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    throw new Error('Invalid JSON response: ' + responseText);
  }

  // Verify order_id exists in response
  if (!data?.draft_order?.order_id) {
    logger.error('completeDraftOrder', `Order not created for ${email}`, { response: data });
    throw new Error('Order not created: ' + responseText);
  }

  const completedOrder = data.draft_order;

  logger.info('=== SUCCESS ===');
  logger.info(`Order ID: ${completedOrder.order_id}`);
  logger.info(`Email will be sent to: ${email}`);
  logger.info(`Draft Status: ${completedOrder.status}`);

  return completedOrder;
}

module.exports = { completeDraftOrder };
