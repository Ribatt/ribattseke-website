// Cloudflare Pages Function: POST /api/checkout
// Creates a Yoco hosted-checkout session server-side.
// Amount is NEVER trusted from the client — derived here from item key.

const ITEMS = {
  'companion-ir': { name: 'Installation Rules Companion Pack', amountRand: 1000 },
};

const TVET_TIERS = { t10: 10, t20: 20, t100: 100 };

export async function onRequestPost(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://ribattseke.co.za',
    'Content-Type': 'application/json',
  };

  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders });
  }

  const { item, email, isAfricaTvet, tier, customAmount } = body;

  // Validate email
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Valid email required.' }), { status: 400, headers: corsHeaders });
  }

  // Validate item
  if (!ITEMS[item]) {
    return new Response(JSON.stringify({ error: 'Unknown item.' }), { status: 400, headers: corsHeaders });
  }

  // Server-side amount determination
  let amountInRand;
  if (isAfricaTvet) {
    if (tier && TVET_TIERS[tier]) {
      amountInRand = TVET_TIERS[tier];
    } else if (customAmount) {
      const ca = parseInt(customAmount, 10);
      if (isNaN(ca) || ca < 10 || ca > 1000) {
        return new Response(JSON.stringify({ error: 'Custom amount must be between R10 and R1000.' }), { status: 400, headers: corsHeaders });
      }
      amountInRand = ca;
    } else {
      return new Response(JSON.stringify({ error: 'Africa TVET: select a tier or enter a custom amount.' }), { status: 400, headers: corsHeaders });
    }
  } else {
    amountInRand = ITEMS[item].amountRand;
  }

  const amountInCents = amountInRand * 100;

  // Yoco minimum is R2 (200 cents)
  if (amountInCents < 200) {
    return new Response(JSON.stringify({ error: 'Amount is below the Yoco minimum of R2.' }), { status: 400, headers: corsHeaders });
  }

  const secretKey = env.YOCO_SECRET_KEY;
  if (!secretKey) {
    return new Response(JSON.stringify({ error: 'Payment system not configured.' }), { status: 503, headers: corsHeaders });
  }

  const checkoutId = crypto.randomUUID();
  const origin = 'https://ribattseke.co.za';

  let yocoResp, yocoData;
  try {
    yocoResp = await fetch('https://payments.yoco.com/api/checkouts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': checkoutId,
      },
      body: JSON.stringify({
        amount: amountInCents,
        currency: 'ZAR',
        successUrl: `${origin}/payment-success?ref=${checkoutId}`,
        cancelUrl: `${origin}/payment-cancel`,
        failureUrl: `${origin}/payment-failed`,
        metadata: {
          checkoutId,
          studentEmail: email,
          selectedTrackOrBundle: item,
          isAfricaTvet: isAfricaTvet ? 'true' : 'false',
          selectedTier: tier || 'standard',
        },
      }),
    });
    yocoData = await yocoResp.json();
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Could not reach Yoco.', detail: String(err) }), { status: 502, headers: corsHeaders });
  }

  if (!yocoResp.ok) {
    return new Response(JSON.stringify({ error: 'Yoco rejected the checkout.', detail: yocoData }), { status: 502, headers: corsHeaders });
  }

  // Persist a checkout record so the webhook can verify amount/currency
  if (env.ORDERS_KV) {
    const record = {
      item,
      email,
      amountInCents,
      currency: 'ZAR',
      isAfricaTvet: !!isAfricaTvet,
      tier: tier || null,
      createdAt: Date.now(),
      status: 'pending',
    };
    await env.ORDERS_KV.put(`checkout:${checkoutId}`, JSON.stringify(record), { expirationTtl: 86400 });
  }

  return new Response(JSON.stringify({ redirectUrl: yocoData.redirectUrl, checkoutId }), { status: 200, headers: corsHeaders });
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://ribattseke.co.za',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
