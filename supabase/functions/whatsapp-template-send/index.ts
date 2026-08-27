import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { renderTemplateText } from '../_shared/whatsapp-templates.ts';
import { getUserFromToken } from '../_shared/auth.ts';

/**
 * Disparo de templates aprovados para contatos selecionados.
 *
 * O envio em si continua sendo responsabilidade do whatsapp-sender: aqui apenas
 * garantimos conversa + registro no histórico e enfileiramos um item
 * `message_type = 'template'` com a spec em `metadata.template` — exatamente o
 * formato que o sender já sabe traduzir para a Graph API.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NAME_PATTERN = /^[a-z0-9_]{1,512}$/;
const LANGUAGE_PATTERN = /^[a-zA-Z]{2}(_[a-zA-Z]{2,3})?$/;
const MAX_CONTACTS = 200;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface ContactRow {
  id: string;
  name: string | null;
  call_name: string | null;
  phone_number: string | null;
}

/** Tokens aceitos nas variáveis: valor fixo ou campo do contato. */
function resolveParam(token: string, contact: ContactRow): string {
  switch (token) {
    case '{{contact.name}}':
      return (contact.call_name || contact.name || '').trim();
    case '{{contact.phone}}':
      return (contact.phone_number || '').trim();
    default:
      return token;
  }
}

serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (request.method !== 'POST') return json(405, { error: 'Método não permitido' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

  try {
    const authorization = request.headers.get('authorization');
    if (!authorization) return json(401, { error: 'Unauthorized' });
    const token = authorization.replace(/^Bearer\s+/i, '').trim();
    const auth = createClient(supabaseUrl, anonKey);
    const service = createClient(supabaseUrl, serviceKey);
    const { data: userData, error: userError } = await getUserFromToken(token);
    if (userError || !userData.user) return json(401, { error: 'Unauthorized' });

    const body = await request.json().catch(() => ({}));
    const name = String(body?.name ?? '').trim().toLowerCase();
    const language = String(body?.language ?? '').trim();
    const bodyText = typeof body?.bodyText === 'string' ? body.bodyText : '';
    const paramTokens: string[] = Array.isArray(body?.params)
      ? body.params.map((value: unknown) => String(value ?? '').slice(0, 500))
      : [];
    const contactIds: string[] = Array.isArray(body?.contactIds)
      ? Array.from(new Set<string>(body.contactIds.map((value: unknown) => String(value)))).slice(0, MAX_CONTACTS + 1)
      : [];

    if (!NAME_PATTERN.test(name)) return json(400, { error: 'Template inválido.', code: 'invalid_template' });
    if (!LANGUAGE_PATTERN.test(language)) return json(400, { error: 'Idioma do template inválido.', code: 'invalid_language' });
    if (contactIds.length === 0) return json(400, { error: 'Selecione ao menos um contato.', code: 'no_contacts' });
    if (contactIds.length > MAX_CONTACTS) {
      return json(400, { error: `Selecione no máximo ${MAX_CONTACTS} contatos por disparo.`, code: 'too_many_contacts' });
    }
    if (paramTokens.some((value) => value.trim() === '')) {
      return json(400, { error: 'Preencha todas as variáveis do template.', code: 'missing_params' });
    }

    const { data: adminRole, error: roleError } = await service
      .from('user_roles').select('role').eq('user_id', userData.user.id).eq('role', 'admin').maybeSingle();
    if (roleError) throw roleError;
    if (!adminRole) {
      const { data: membership, error: memberError } = await service
        .from('workspace_members').select('role').eq('user_id', userData.user.id).eq('status', 'active');
      if (memberError) throw memberError;
      const rows = (membership ?? []) as Array<{ role: string }>;
      if (!rows.some((row) => row.role === 'admin' || row.role === 'editor')) {
        return json(403, { error: 'Sem permissão para disparar templates.', code: 'not_allowed' });
      }
    }

    const { data: contactsData, error: contactsError } = await service
      .from('contacts')
      .select('id, name, call_name, phone_number, is_blocked')
      .in('id', contactIds);
    if (contactsError) throw contactsError;
    const contacts = (contactsData ?? []) as Array<ContactRow & { is_blocked: boolean | null }>;

    const results: Array<{ contactId: string; status: 'queued' | 'skipped'; reason?: string }> = [];

    for (const contact of contacts) {
      if (contact.is_blocked) {
        results.push({ contactId: contact.id, status: 'skipped', reason: 'Contato bloqueado' });
        continue;
      }
      if (!contact.phone_number) {
        results.push({ contactId: contact.id, status: 'skipped', reason: 'Contato sem telefone' });
        continue;
      }

      const bodyParams = paramTokens.map((tokenValue) => resolveParam(tokenValue, contact));
      const rendered = bodyText ? renderTemplateText(bodyText, bodyParams) : `[template] ${name}`;

      // Conversa mais recente do contato; sem nenhuma, cria uma para o histórico.
      const { data: existing, error: conversationError } = await service
        .from('conversations')
        .select('id')
        .eq('contact_id', contact.id)
        .order('last_message_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (conversationError) throw conversationError;

      let conversationId = (existing as { id: string } | null)?.id ?? null;
      if (!conversationId) {
        const { data: created, error: createError } = await service
          .from('conversations')
          .insert({ contact_id: contact.id, status: 'human' })
          .select('id')
          .single();
        if (createError) throw createError;
        conversationId = (created as { id: string }).id;
      }

      const { data: messageRow, error: messageError } = await service
        .from('messages')
        .insert({
          conversation_id: conversationId,
          content: rendered,
          type: 'text',
          from_type: 'human',
          status: 'processing',
          sent_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (messageError) throw messageError;

      const { error: queueError } = await service.from('send_queue').insert({
        conversation_id: conversationId,
        contact_id: contact.id,
        content: rendered,
        from_type: 'human',
        message_type: 'template',
        priority: 2,
        message_id: (messageRow as { id: string }).id,
        metadata: { template: { name, language, bodyParams } },
      });
      if (queueError) throw queueError;

      results.push({ contactId: contact.id, status: 'queued' });
    }

    const queued = results.filter((result) => result.status === 'queued').length;
    if (queued > 0) {
      // Falha no gatilho não perde o disparo: o cron do sender processa a fila.
      const { error: triggerError } = await service.functions.invoke('whatsapp-sender');
      if (triggerError) console.error('[whatsapp-template-send] trigger error', triggerError.message);
    }

    return json(200, { queued, skipped: results.filter((r) => r.status === 'skipped'), results });
  } catch (error) {
    console.error('[whatsapp-template-send] error', error instanceof Error ? error.message : error);
    return json(500, { error: 'Não foi possível disparar o template.', code: 'unexpected_error' });
  }
});
