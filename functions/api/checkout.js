// Cloudflare Pages Function: POST /api/checkout
// Creates a Yoco hosted-checkout session server-side.
// Amount is NEVER trusted from the client — derived here from item key.

// All book prices are SABS base cost × 1.40 (40% markup), free delivery included.
// Amounts stored in cents (integer). Non-round prices preserved from exact calculation.
const ITEMS = {
  'companion-ir':       { name: 'Installation Rules Companion Pack',                       amountCents: 100000 },
  // SANS 10142-1 — Wiring of Premises
  'sans10142-pdf':      { name: 'SANS 10142-1 (Ed 3.3) PDF',                              amountCents: 170000 },
  'sans10142-print':    { name: 'SANS 10142-1 (Ed 3.3) Hardcopy',                         amountCents: 190000 },
  // SANS 10198-1 — Cables Part 1
  'sans10198-1-pdf':    { name: 'SANS 10198-1 PDF',                                       amountCents:  47817 },
  'sans10198-1-print':  { name: 'SANS 10198-1 Hardcopy',                                  amountCents:  53130 },
  // SANS 10198-2 — Cables Part 2
  'sans10198-2-pdf':    { name: 'SANS 10198-2 PDF',                                       amountCents: 100561 },
  'sans10198-2-print':  { name: 'SANS 10198-2 Hardcopy',                                  amountCents: 111734 },
  // SANS 10292 — Earthing LV
  'sans10292-pdf':      { name: 'SANS 10292 PDF',                                         amountCents: 105487 },
  'sans10292-print':    { name: 'SANS 10292 Hardcopy',                                    amountCents: 117208 },
  // SANS 1507-1 — Cables fixed wiring
  'sans1507-1-pdf':     { name: 'SANS 1507-1 PDF',                                        amountCents:  61002 },
  'sans1507-1-print':   { name: 'SANS 1507-1 Hardcopy',                                   amountCents:  67781 },
  // SANS 1973-3 — Switchgear assemblies
  'sans1973-3-pdf':     { name: 'SANS 1973-3 PDF',                                        amountCents:  88969 },
  'sans1973-3-print':   { name: 'SANS 1973-3 Hardcopy',                                   amountCents:  98854 },
  // SANS 10313 — Lightning protection
  'sans10313-pdf':      { name: 'SANS 10313 PDF',                                         amountCents:  70857 },
  'sans10313-print':    { name: 'SANS 10313 Hardcopy',                                    amountCents:  78729 },
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

  const { item, email, isAfricaTvet, tier, customAmount, deliveryName, deliveryCell, deliveryAddress } = body;

  // Validate email
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Valid email required.' }), { status: 400, headers: corsHeaders });
  }

  // Validate item
  if (!ITEMS[item]) {
    return new Response(JSON.stringify({ error: 'Unknown item.' }), { status: 400, headers: corsHeaders });
  }

  // Server-side amount determination — amount is NEVER trusted from the client
  let amountInCents;
  if (isAfricaTvet) {
    if (tier && TVET_TIERS[tier]) {
      amountInCents = TVET_TIERS[tier] * 100;
    } else if (customAmount) {
      const ca = parseInt(customAmount, 10);
      if (isNaN(ca) || ca < 10 || ca > 1000) {
        return new Response(JSON.stringify({ error: 'Custom amount must be between R10 and R1000.' }), { status: 400, headers: corsHeaders });
      }
      amountInCents = ca * 100;
    } else {
      return new Response(JSON.stringify({ error: 'Africa TVET: select a tier or enter a custom amount.' }), { status: 400, headers: corsHeaders });
    }
  } else {
    amountInCents = ITEMS[item].amountCents;
  }

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
          deliveryName: deliveryName || '',
          deliveryCell: deliveryCell || '',
          deliveryAddress: deliveryAddress || '',
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
      deliveryName: deliveryName || null,
      deliveryCell: deliveryCell || null,
      deliveryAddress: deliveryAddress || null,
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
