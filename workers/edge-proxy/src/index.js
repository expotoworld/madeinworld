export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const originalPath = url.pathname;

    // Map path prefixes to services and support aliases
    // - /api/auth           -> AUTH
    // - /api/v1             -> CATALOG (native)
    // - /api/cat            -> CATALOG (alias -> rewrite to /api/v1)
    // - /api/cart, /api/orders -> ORDER
    // - /api/admin          -> USER (native)
    // - /api/users          -> USER (alias -> rewrite to /api/admin)

    // Helper: CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request.headers.get('Origin')),
      });
    }

    let upstream = null;
    let rewritePath = null;

    // Health path compatibility shims
    if (originalPath === '/api/v1/health') {
      upstream = env.CATALOG_SERVICE_URL;
      rewritePath = '/health';
    } else if (originalPath === '/api/auth/health') {
      upstream = env.AUTH_SERVICE_URL;
      rewritePath = '/health';
    } else if (originalPath === '/api/admin/health') {
      upstream = env.USER_SERVICE_URL;
      rewritePath = '/health';
    } else if (originalPath.startsWith('/api/auth')) {
      upstream = env.AUTH_SERVICE_URL;
    } else if (originalPath.startsWith('/api/v1')) {
      upstream = env.CATALOG_SERVICE_URL;
    } else if (originalPath.startsWith('/uploads')) {
      // Serve static/uploads from the catalog service
      upstream = env.CATALOG_SERVICE_URL;
    } else if (originalPath.startsWith('/api/cat')) {
      upstream = env.CATALOG_SERVICE_URL;
      rewritePath = originalPath.replace('/api/cat', '/api/v1');
    } else if (originalPath.startsWith('/api/cart') || originalPath.startsWith('/api/orders')) {
      upstream = env.ORDER_SERVICE_URL;
    } else if (originalPath.startsWith('/api/admin/orders') || originalPath.startsWith('/api/admin/carts')) {
      // Route admin orders and carts to the Order Service
      upstream = env.ORDER_SERVICE_URL;
    } else if (originalPath.startsWith('/api/admin/manufacturer')) {
      // Route manufacturer admin endpoints to the Order Service
      upstream = env.ORDER_SERVICE_URL;
    } else if (originalPath.startsWith('/api/manufacturer')) {
      // Route non-admin manufacturer endpoints to the Order Service
      upstream = env.ORDER_SERVICE_URL;
    } else if (originalPath.startsWith('/api/admin/users')) {
      // Route admin user management to the User Service
      upstream = env.USER_SERVICE_URL;
    } else if (originalPath.startsWith('/api/admin')) {
      // Default admin routes go to the User Service
      upstream = env.USER_SERVICE_URL;
    } else if (originalPath.startsWith('/api/users')) {
      upstream = env.USER_SERVICE_URL;
      rewritePath = originalPath.replace('/api/users', '/api/admin');
    } else if (originalPath === '/health') {
      upstream = env.CATALOG_SERVICE_URL;
    }

    if (!upstream) {
      return new Response('Not found', { status: 404 });
    }

    const upstreamUrl = new URL(upstream);
    url.hostname = upstreamUrl.hostname;
    url.protocol = upstreamUrl.protocol;
    url.port = upstreamUrl.port;
    if (rewritePath) url.pathname = rewritePath;

    const headers = new Headers(request.headers);
    headers.set('x-correlation-id', crypto.randomUUID());

    const resp = await fetch(new Request(url.toString(), {
      method: request.method,
      headers,
      body: ['GET','HEAD'].includes(request.method) ? undefined : request.body,
      redirect: 'follow',
    }));

    // Add CORS headers on response
    const responseHeaders = new Headers(resp.headers);
    const origin = request.headers.get('Origin');
    const cors = corsHeaders(origin);
    cors.forEach((v, k) => responseHeaders.set(k, v));

    return new Response(resp.body, { status: resp.status, headers: responseHeaders });
  }
};

function corsHeaders(origin) {
  const h = new Headers();
  h.set('Access-Control-Allow-Origin', origin || '*');
  h.set('Vary', 'Origin');
  h.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  h.set('Access-Control-Allow-Headers', 'Origin,Content-Type,Accept,Authorization,X-Correlation-Id,X-Admin-Request');
  h.set('Access-Control-Allow-Credentials', 'true');
  return h;
}
