// Cloudflare Pages Function: GET /api/orders
// Returns paginated order records from ORDERS_KV for the admin sales dashboard.
// Protected by ADM_PIN env var — client must send Authorization: Bearer <pin>

const ITEM_LABELS = {
  'companion-ir':      'IR Companion Pack',
  'sans10142-pdf':     'SANS 10142-1 PDF',
  'sans10142-print':   'SANS 10142-1 Hardcopy',
  'sans10198-1-pdf':   'SANS 10198-1 PDF',
  'sans10198-1-print': 'SANS 10198-1 Hardcopy',
  'sans10198-2-pdf':   'SANS 10198-2 PDF',
  'sans10198-2-print': 'SANS 10198-2 Hardcopy',
  'sans10292-pdf':     'SANS 10292 PDF',
  'sans10292-print':   'SANS 10292 Hardcopy',
  'sans1507-1-pdf':    'SANS 1507-1 PDF',
  'sans1507-1-print':  'SANS 1507-1 Hardcopy',
  'sans1973-3-pdf':    'SANS 1973-3 PDF',
  'sans1973-3-print':  'SANS 1973-3 Hardcopy',
  'sans10313-pdf':     'SANS 10313 PDF',
  'sans10313-print':   'SANS 10313 Hardcopy',
};

export async function onRequestGet(context) {
  const { request, env } = context;

  const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://ribattseke.co.za',
    'Content-Type': 'application/json',
  };

  // PIN auth — client sends Authorization: Bearer <pin>
  const admPin = env.ADM_PIN;
  const authHeader = request.headers.get('Authorization') || '';
  if (!admPin || authHeader !== `Bearer ${admPin}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  if (!env.ORDERS_KV) {
    return new Response(JSON.stringify({ error: 'KV not configured', orders: [] }), { status: 503, headers: corsHeaders });
  }

  try {
    // List all checkout keys (up to 1000)
    const listed = await env.ORDERS_KV.list({ prefix: 'checkout:', limit: 1000 });
    const keys = listed.keys.map(k => k.name);

    // Fetch all records in parallel (batches of 50)
    const BATCH = 50;
    let records = [];
    for (let i = 0; i < keys.length; i += BATCH) {
      const batch = keys.slice(i, i + BATCH);
      const fetched = await Promise.all(
        batch.map(k => env.ORDERS_KV.get(k, { type: 'json' }).catch(() => null))
      );
      fetched.forEach((rec, idx) => {
        if (rec) {
          records.push({
            checkoutId: keys[i + idx].replace('checkout:', ''),
            ...rec,
            itemLabel: ITEM_LABELS[rec.item] || rec.item,
          });
        }
      });
    }

    // Sort newest first
    records.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    // Summary stats
    const fulfilled = records.filter(r => r.status === 'fulfilled');
    const totalRevenueCents = fulfilled.reduce((s, r) => s + (r.amountInCents || 0), 0);
    const byItem = {};
    fulfilled.forEach(r => {
      const lbl = r.itemLabel || r.item;
      if (!byItem[lbl]) byItem[lbl] = { count: 0, totalCents: 0 };
      byItem[lbl].count++;
      byItem[lbl].totalCents += (r.amountInCents || 0);
    });

    return new Response(JSON.stringify({
      orders: records,
      summary: {
        total: records.length,
        fulfilled: fulfilled.length,
        pending: records.filter(r => r.status === 'pending').length,
        refunded: records.filter(r => r.status === 'refunded').length,
        totalRevenueCents,
        byItem,
      },
    }), { status: 200, headers: corsHeaders });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'KV read failed', detail: String(err) }), { status: 500, headers: corsHeaders });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': 'https://ribattseke.co.za',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
