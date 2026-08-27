// Catálogo de provedores/modelos de LLM + dispatcher multi-provider.
// O motor (nina-engine) só enxerga o formato OpenAI (messages/tools/tool_calls);
// toda conversão de dialeto vive aqui: Lovable AI gateway e OpenAI falam
// chat/completions, Anthropic fala Messages API (convertida nas duas direções).
// Se o provedor externo falhar (chave ausente, 401, 429, 5xx), o dispatcher
// cai automaticamente para o Lovable AI — a Nina nunca fica muda por causa
// de um provedor fora do ar.
//
// Catálogo auditado em 27/jul/2026 contra docs oficiais dos 3 provedores.
// ATENÇÃO: src/lib/llmCatalog.ts espelha este catálogo para a UI.
// Alterou modelo aqui? Atualize lá também.

export const LOVABLE_AI_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

export type LlmProvider = 'lovable' | 'anthropic' | 'openai';
export type LlmTier = 'low' | 'medium' | 'high';

export interface LlmApiKeys {
  lovable: string;
  anthropic?: string | null;
  openai?: string | null;
}

interface CatalogModel {
  id: string;
  tier: LlmTier;
}

interface ProviderCatalog {
  defaultModel: string;
  tierDefault: Record<LlmTier, string>;
  models: CatalogModel[];
}

export const LLM_CATALOG: Record<LlmProvider, ProviderCatalog> = {
  lovable: {
    // Default atual do próprio gateway (desde 22/jul/2026)
    defaultModel: 'google/gemini-3.6-flash',
    tierDefault: {
      low: 'google/gemini-2.5-flash-lite',
      medium: 'google/gemini-3.6-flash',
      high: 'google/gemini-2.5-pro',
    },
    models: [
      { id: 'google/gemini-2.5-flash-lite', tier: 'low' },
      { id: 'google/gemini-3.1-flash-lite', tier: 'low' },
      { id: 'openai/gpt-5.6-luna', tier: 'low' },
      { id: 'google/gemini-3.6-flash', tier: 'medium' },
      { id: 'google/gemini-2.5-flash', tier: 'medium' },
      { id: 'openai/gpt-5.6-terra', tier: 'medium' },
      { id: 'google/gemini-3.1-pro-preview', tier: 'high' },
      { id: 'google/gemini-2.5-pro', tier: 'high' },
      { id: 'openai/gpt-5.6-sol', tier: 'high' },
    ],
  },
  anthropic: {
    defaultModel: 'claude-sonnet-5',
    tierDefault: {
      low: 'claude-haiku-4-5',
      medium: 'claude-sonnet-5',
      high: 'claude-opus-5',
    },
    models: [
      { id: 'claude-haiku-4-5', tier: 'low' },
      { id: 'claude-sonnet-5', tier: 'medium' },
      { id: 'claude-opus-5', tier: 'high' },
      { id: 'claude-opus-4-8', tier: 'high' },
      { id: 'claude-fable-5', tier: 'high' },
    ],
  },
  openai: {
    defaultModel: 'gpt-5.6-terra',
    tierDefault: {
      low: 'gpt-5.6-luna',
      medium: 'gpt-5.6-terra',
      high: 'gpt-5.6-sol',
    },
    models: [
      { id: 'gpt-5.6-luna', tier: 'low' },
      { id: 'gpt-5.6-terra', tier: 'medium' },
      { id: 'gpt-5.6-sol', tier: 'high' },
    ],
  },
};

export function isLlmProvider(v: unknown): v is LlmProvider {
  return v === 'lovable' || v === 'anthropic' || v === 'openai';
}

export function modelForTier(provider: LlmProvider, tier: LlmTier): string {
  return LLM_CATALOG[provider].tierDefault[tier];
}

export interface ResolvedModelSettings {
  provider: LlmProvider;
  model: string;
  temperature: number;
  /** true = alternar tier por contexto (orchestrator decide; demais usam o default) */
  adaptive: boolean;
}

// Mapeamento do enum legado ai_model_mode (pré multi-provider, sempre Lovable).
// 'pro3' apontava para google/gemini-3-pro-preview, que saiu do gateway em
// jul/2026 — remapeado para o sucessor.
const LEGACY_MODES: Record<string, string> = {
  flash: 'google/gemini-3.6-flash',
  pro: 'google/gemini-2.5-pro',
  pro3: 'google/gemini-3.1-pro-preview',
};

/**
 * Resolve provedor + modelo a partir das nina_settings.
 * Precedência: ai_model (novo) > ai_model_mode (legado) > default do provedor.
 * overrideMode: modo legado vindo do simulador/eval ('flash'|'pro'|'pro3'|'adaptive').
 */
export function resolveModelSettings(
  settings: any,
  overrideMode?: string | null,
): ResolvedModelSettings {
  const provider: LlmProvider = isLlmProvider(settings?.ai_provider) ? settings.ai_provider : 'lovable';
  const temperature = 0.7;
  const catalog = LLM_CATALOG[provider];

  // Override do simulador/eval: vocabulário legado ('flash'|'pro'|'pro3'|'adaptive')
  // ou o token 'provider:model' que o eval grava como snapshot da rodada
  if (overrideMode) {
    if (overrideMode === 'adaptive') {
      return { provider, model: catalog.defaultModel, temperature, adaptive: true };
    }
    const legacy = LEGACY_MODES[overrideMode];
    if (legacy) return { provider: 'lovable', model: legacy, temperature, adaptive: false };
    const sep = overrideMode.indexOf(':');
    if (sep > 0) {
      const p = overrideMode.slice(0, sep);
      const m = overrideMode.slice(sep + 1);
      if (isLlmProvider(p) && m) {
        return { provider: p, model: m, temperature, adaptive: false };
      }
    }
  }

  const aiModel = typeof settings?.ai_model === 'string' ? settings.ai_model.trim() : '';
  if (aiModel === 'adaptive') {
    return { provider, model: catalog.defaultModel, temperature, adaptive: true };
  }
  if (aiModel) {
    // Modelo de outro provedor gravado por engano → default do provedor atual.
    const otherProviders = (Object.keys(LLM_CATALOG) as LlmProvider[]).filter((p) => p !== provider);
    const belongsElsewhere = otherProviders.some((p) =>
      LLM_CATALOG[p].models.some((m) => m.id === aiModel));
    if (!belongsElsewhere) {
      return { provider, model: aiModel, temperature, adaptive: false };
    }
    return { provider, model: catalog.defaultModel, temperature, adaptive: false };
  }

  // Legado: instalação anterior à seleção de provedor
  const mode = settings?.ai_model_mode;
  if (mode === 'adaptive') {
    return { provider, model: catalog.defaultModel, temperature, adaptive: true };
  }
  if (provider === 'lovable' && mode && LEGACY_MODES[mode]) {
    return { provider, model: LEGACY_MODES[mode], temperature, adaptive: false };
  }

  return { provider, model: catalog.defaultModel, temperature, adaptive: false };
}

// ---------------------------------------------------------------------------
// Dispatcher

export interface NormalizedToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface NormalizedChatResult {
  content: string;
  toolCalls: NormalizedToolCall[];
  /** true quando esta resposta veio do Lovable AI por fallback do provedor escolhido */
  usedFallback: boolean;
}

export interface ChatCallParams {
  provider: LlmProvider;
  model: string;
  apiKeys: LlmApiKeys;
  /** formato OpenAI: system/user/assistant(tool_calls)/tool */
  messages: any[];
  /** formato OpenAI: [{type:'function', function:{name, description, parameters}}] */
  tools: any[];
  temperature: number;
  maxTokens: number;
  toolChoice: 'auto' | 'none';
}

async function callOpenAICompatible(
  url: string,
  apiKey: string,
  params: ChatCallParams,
  isOpenAI: boolean,
): Promise<NormalizedChatResult> {
  const body: any = {
    model: params.model,
    messages: params.messages,
    tool_choice: params.toolChoice,
  };
  // tools: [] vazio causa comportamento errático em alguns provedores — omitir
  if (params.tools.length > 0) body.tools = params.tools;
  else delete body.tool_choice;

  if (isOpenAI) {
    // gpt-5.x no chat/completions: max_tokens virou max_completion_tokens;
    // temperature custom é rejeitada; e tools + reasoning dão 400 — por isso
    // reasoning_effort 'none' (chat de SDR não precisa de reasoning longo).
    body.max_completion_tokens = Math.max(params.maxTokens * 2, 2000);
    body.reasoning_effort = 'none';
  } else {
    body.max_tokens = params.maxTokens;
    body.temperature = params.temperature;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[LLM] ${isOpenAI ? 'OpenAI' : 'Lovable AI'} error:`, response.status, errorText);
    if (!isOpenAI) {
      if (response.status === 429) throw new Error('Rate limit exceeded, will retry later');
      if (response.status === 402) throw new Error('Payment required - please add credits');
    }
    throw new Error(`AI error: ${response.status}`);
  }

  const data = await response.json();
  const msg = data.choices?.[0]?.message ?? {};
  const toolCalls: NormalizedToolCall[] = (msg.tool_calls ?? []).map((tc: any) => ({
    id: tc.id,
    type: 'function' as const,
    function: { name: tc.function?.name ?? '', arguments: tc.function?.arguments ?? '{}' },
  }));
  return { content: msg.content ?? '', toolCalls, usedFallback: false };
}

function toAnthropicPayload(params: ChatCallParams) {
  const systemParts: string[] = [];
  const out: any[] = [];

  const pushToolResult = (m: any) => {
    const block = {
      type: 'tool_result',
      tool_use_id: m.tool_call_id,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''),
    };
    // tool_results do mesmo turno de tools precisam ficar no MESMO turno user
    const last = out[out.length - 1];
    if (last && last.role === 'user' && Array.isArray(last.content) && last.content[0]?.type === 'tool_result') {
      last.content.push(block);
    } else {
      out.push({ role: 'user', content: [block] });
    }
  };

  for (const m of params.messages) {
    if (m.role === 'system') {
      if (m.content) systemParts.push(String(m.content));
    } else if (m.role === 'tool') {
      pushToolResult(m);
    } else if (m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      const blocks: any[] = [];
      if (m.content) blocks.push({ type: 'text', text: String(m.content) });
      for (const tc of m.tool_calls) {
        let input: any = {};
        try { input = JSON.parse(tc.function?.arguments ?? '{}'); } catch { /* args inválidos */ }
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.function?.name, input });
      }
      // Se o histórico já terminava em assistant (double-text do cliente com a
      // resposta da Nina chegando depois), fundir no mesmo turno — a Messages
      // API rejeita dois turnos assistant consecutivos
      const last = out[out.length - 1];
      if (last && last.role === 'assistant') {
        if (typeof last.content === 'string') {
          last.content = [{ type: 'text', text: last.content }];
        }
        last.content.push(...blocks);
      } else {
        out.push({ role: 'assistant', content: blocks });
      }
    } else {
      // Histórico de WhatsApp tem turnos seguidos do mesmo lado; a Messages API
      // exige alternância user/assistant — turnos de texto consecutivos são
      // fundidos num só. Texto vazio também é rejeitado (min length 1).
      const text = String(m.content ?? '') || '(mensagem vazia)';
      const last = out[out.length - 1];
      if (last && last.role === m.role && typeof last.content === 'string') {
        last.content = `${last.content}\n${text}`;
      } else {
        out.push({ role: m.role, content: text });
      }
    }
  }

  // A conversa precisa começar com um turno user
  if (out.length === 0 || out[0].role !== 'user') {
    out.unshift({ role: 'user', content: '(início da conversa)' });
  }
  // ...e não pode terminar em assistant (prefill): modelos com adaptive
  // thinking rejeitam, e trailing whitespace também. Acontece quando a última
  // mensagem do histórico é da própria Nina (resposta cruzou com o cliente).
  if (out[out.length - 1].role === 'assistant') {
    out.push({ role: 'user', content: '(continue a conversa respondendo às mensagens acima)' });
  }

  const isHaiku = params.model.startsWith('claude-haiku');
  const payload: any = {
    model: params.model,
    system: systemParts.join('\n\n') || undefined,
    messages: out,
    tools: params.tools.map((t: any) => ({
      name: t.function?.name,
      description: t.function?.description,
      input_schema: t.function?.parameters ?? { type: 'object', properties: {} },
    })),
    tool_choice: { type: params.toolChoice === 'none' ? 'none' : 'auto' },
  };

  if (isHaiku) {
    // Haiku 4.5: sem adaptive thinking; temperature ainda é aceita
    payload.max_tokens = params.maxTokens;
    payload.temperature = params.temperature;
  } else {
    // Sonnet 5 / Opus 5 / Fable 5: adaptive thinking on por default e o
    // max_tokens cobre thinking + resposta (por isso a folga); temperature
    // custom é rejeitada (400); esforço baixo mantém latência de chat.
    payload.max_tokens = Math.min(Math.max(params.maxTokens * 4, 8000), 16000);
    payload.output_config = { effort: 'low' };
  }

  return payload;
}

async function callAnthropic(apiKey: string, params: ChatCallParams): Promise<NormalizedChatResult> {
  const response = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(toAnthropicPayload(params)),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[LLM] Anthropic error:', response.status, errorText);
    throw new Error(`AI error: ${response.status}`);
  }

  const data = await response.json();
  if (data.stop_reason === 'refusal') {
    console.warn('[LLM] Anthropic retornou refusal — resposta vazia');
  }
  const blocks: any[] = Array.isArray(data.content) ? data.content : [];
  const content = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const toolCalls: NormalizedToolCall[] = blocks
    .filter((b) => b.type === 'tool_use')
    .map((b) => ({
      id: b.id,
      type: 'function' as const,
      function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) },
    }));
  return { content, toolCalls, usedFallback: false };
}

async function callProvider(params: ChatCallParams): Promise<NormalizedChatResult> {
  switch (params.provider) {
    case 'anthropic': {
      const key = params.apiKeys.anthropic;
      if (!key) throw new Error('Anthropic API key não configurada');
      return await callAnthropic(key, params);
    }
    case 'openai': {
      const key = params.apiKeys.openai;
      if (!key) throw new Error('OpenAI API key não configurada');
      return await callOpenAICompatible(OPENAI_URL, key, params, true);
    }
    case 'lovable':
    default:
      return await callOpenAICompatible(LOVABLE_AI_URL, params.apiKeys.lovable, params, false);
  }
}

/**
 * Chama o provedor escolhido; se for externo e falhar (chave ausente, 4xx/5xx,
 * rede), refaz a MESMA chamada no Lovable AI com o modelo default do gateway.
 * Erros do próprio Lovable propagam (429/402 têm semântica de retry na fila).
 */
export async function callChatWithFallback(params: ChatCallParams): Promise<NormalizedChatResult> {
  if (params.provider === 'lovable') {
    return await callProvider(params);
  }
  try {
    return await callProvider(params);
  } catch (err) {
    console.warn(`[LLM] Provedor ${params.provider} falhou (${err instanceof Error ? err.message : err}) — fallback para Lovable AI`);
    const fallback = await callProvider({
      ...params,
      provider: 'lovable',
      model: LLM_CATALOG.lovable.defaultModel,
    });
    return { ...fallback, usedFallback: true };
  }
}
