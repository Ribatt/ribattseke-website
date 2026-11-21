// Cloudflare Pages Function: POST /api/webhook
// Handles Yoco Standard Webhooks — payment.succeeded, payment.failed, refund.succeeded
// Verifies signature before trusting any payload data.
// Delivers companion pack by notifying ribattseke.co.za via email (MailChannels).

const WEBHOOK_TOLERANCE_SECONDS = 180; // 3 minutes

async function verifyWebhookSignature(request, secret) {
  const webhookId        = request.headers.get('webhook-id');
  const webhookTimestamp = request.headers.get('webhook-timestamp');
  const webhookSig       = request.headers.get('webhook-signature');

  if (!webhookId || !webhookTimestamp || !webhookSig) {
    return { ok: false, reason: 'Missing webhook headers' };
  }

  // Timestamp check: reject if outside tolerance
  const tsSeconds = parseInt(webhookTimestamp, 10);
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - tsSeconds) > WEBHOOK_TOLERANCE_SECONDS) {
    return { ok: false, reason: 'Timestamp outside tolerance' };
  }

  const rawBody = await request.text();

  // Message to sign: "{webhookId}.{webhookTimestamp}.{rawBody}"
  const message = `${webhookId}.${webhookTimestamp}.${rawBody}`;
  const encoder = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  const computed = `v1,${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;

  // webhook-signature may be a space-separated list of "v1,<b64>" values
  const provided = webhookSig.split(' ');
  const match = provided.some((s) => s === computed);
  if (!match) {
    return { ok: false, reason: 'Signature mismatch' };
  }

  return { ok: true, rawBody };
}

async function notifyTseke(env, { event, email, item, amountInCents, checkoutId, deliveryName, deliveryCell, deliveryAddress }) {
  const amountRand = (amountInCents / 100).toFixed(2);
  const subject = event === 'payment.succeeded'
    ? `PAID R${amountRand} — ${item} — ${email}`
    : `FAILED — ${item} — ${email}`;

  const isHardcopy = item && item.endsWith('-print');
  let actionLine;
  if (event === 'payment.succeeded') {
    if (isHardcopy) {
      actionLine = 'ACTION: Ship the hardcopy book to the delivery address below.';
    } else if (item && item.endsWith('-pdf')) {
      actionLine = 'ACTION: Email the PDF to the customer at the address above.';
    } else {
      actionLine = 'ACTION: Send the companion pack PDF to the customer via WhatsApp or email.';
    }
  } else {
    actionLine = 'No action required — payment did not complete.';
  }

  const body = [
    `Event: ${event}`,
    `Checkout ID: ${checkoutId}`,
    `Customer email: ${email}`,
    `Item: ${item}`,
    `Amount: R${amountRand}`,
    deliveryName    ? `Delivery name:    ${deliveryName}`    : '',
    deliveryCell    ? `Delivery cell:    ${deliveryCell}`    : '',
    deliveryAddress ? `Delivery address: ${deliveryAddress}` : '',
    '',
    actionLine,
  ].filter(Boolean).join('\n');

  try {
    await fetch('https://api.mailchannels.net/tx/v1/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email: 'ribattseke@gmail.com', name: 'Riba T Tseke' }],
          cc: [
            { email: 'ribatt3@gmail.com', name: 'Riba T Tseke (secondary)' },
            { email: '60523255@mylife.unisa.ac.za', name: 'Riba T Tseke (UNISA)' },
          ],
        }],
        from: { email: 'noreply@ribattseke.co.za', name: 'ribattseke.co.za Payments' },
        subject,
        content: [{ type: 'text/plain', value: body }],
      }),
    });
  } catch {
    // Best-effort — log but do not fail the webhook response
    console.error('MailChannels send failed');
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const secret = env.YOCO_WEBHOOK_SECRET;
  if (!secret) {
    return new Response('Webhook secret not configured', { status: 503 });
  }

  // Clone request so we can read the body twice (verify then parse)
  const cloned = request.clone();
  const { ok, reason, rawBody } = await verifyWebhookSignature(request, secret);
  if (!ok) {
    console.error('Webhook rejected:', reason);
    return new Response(`Unauthorized: ${reason}`, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  const eventType = payload.type;
  const data      = payload.payload || {};
  const meta      = data.metadata || {};
  const checkoutId = meta.checkoutId;

  // --- payment.succeeded ---
  if (eventType === 'payment.succeeded') {
    // Idempotency: skip if already processed
    if (env.ORDERS_KV && checkoutId) {
      const record = await env.ORDERS_KV.get(`checkout:${checkoutId}`, { type: 'json' }).catch(() => null);
      if (record) {
        // Validate amount and currency match what we stored
        if (record.status === 'fulfilled') {
          return new Response('Already processed', { status: 200 });
        }
        if (record.amountInCents !== data.amount || record.currency !== data.currency) {
          console.error('Amount/currency mismatch — not fulfilling');
          return new Response('Amount mismatch', { status: 400 });
        }
        // Mark fulfilled
        await env.ORDERS_KV.put(
          `checkout:${checkoutId}`,
          JSON.stringify({ ...record, status: 'fulfilled', fulfilledAt: Date.now() }),
          { expirationTtl: 2592000 }, // 30 days
        );
      }
    }

    await notifyTseke(env, {
      event: eventType,
      email: meta.studentEmail || 'unknown',
      item: meta.selectedTrackOrBundle || 'companion-ir',
      amountInCents: data.amount || 0,
      checkoutId: checkoutId || 'n/a',
      deliveryName: meta.deliveryName || '',
      deliveryCell: meta.deliveryCell || '',
      deliveryAddress: meta.deliveryAddress || '',
    });
  }

  // --- payment.failed ---
  if (eventType === 'payment.failed') {
    await notifyTseke(env, {
      event: eventType,
      email: meta.studentEmail || 'unknown',
      item: meta.selectedTrackOrBundle || 'companion-ir',
      amountInCents: data.amount || 0,
      checkoutId: checkoutId || 'n/a',
      deliveryName: meta.deliveryName || '',
      deliveryCell: meta.deliveryCell || '',
      deliveryAddress: meta.deliveryAddress || '',
    });
  }

  // --- refund.succeeded ---
  if (eventType === 'refund.succeeded' && env.ORDERS_KV && checkoutId) {
    const record = await env.ORDERS_KV.get(`checkout:${checkoutId}`, { type: 'json' }).catch(() => null);
    if (record) {
      await env.ORDERS_KV.put(
        `checkout:${checkoutId}`,
        JSON.stringify({ ...record, status: 'refunded', refundedAt: Date.now() }),
        { expirationTtl: 2592000 },
      );
    }
  }

  return new Response('OK', { status: 200 });
}
