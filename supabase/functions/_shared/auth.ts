import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Valida um JWT de usuário e devolve o mesmo formato de `auth.getUser`.
 *
 * Com o esquema de signing keys assimétricas o `getUser(token)` puro (cliente
 * sem header de Authorization) passou a responder 401; `getClaims` verifica a
 * assinatura localmente. O fallback cobre tokens legados/simétricos.
 */
export async function getUserFromToken(
  token: string,
): Promise<{ data: { user: { id: string; email?: string } | null }; error: Error | null }> {
  const clean = (token ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!clean) return { data: { user: null }, error: new Error('missing token') };

  const client = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${clean}` } } },
  );

  const { data: claimsData } = await client.auth.getClaims(clean);
  const sub = claimsData?.claims?.sub as string | undefined;
  if (sub) {
    return { data: { user: { id: sub, email: claimsData?.claims?.email as string | undefined } }, error: null };
  }

  const { data, error } = await client.auth.getUser(clean);
  if (error || !data?.user) return { data: { user: null }, error: error ?? new Error('invalid token') };
  return { data: { user: { id: data.user.id, email: data.user.email ?? undefined } }, error: null };
}


/**
 * Require either a valid user JWT or the service role key.
 * Returns null on success, or a Response (401) to short-circuit the request.
 */
export async function requireAuth(req: Request, corsHeaders: Record<string, string>): Promise<Response | null> {
  const authHeader = req.headers.get('authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  const token = authHeader.replace('Bearer ', '').trim();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey && token === serviceKey) return null;

  const { data, error } = await getUserFromToken(token);
  if (error || !data?.user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  return null;
}

/**
 * Require the service role key (for internal/server-to-server endpoints).
 */
export function requireServiceRole(req: Request, corsHeaders: Record<string, string>): Response | null {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '').trim();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || !serviceKey || token !== serviceKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  return null;
}