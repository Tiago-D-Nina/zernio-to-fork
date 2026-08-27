// Catálogo de provedores/modelos de LLM exibido na aba Comportamento.
// Espelho curado de supabase/functions/_shared/llm.ts (o motor valida por lá).
// Sem preços na UI: o custo é cobrado pelo provedor direto na chave do cliente
// (US$ por milhão de tokens) — as faixas (tiers) comunicam o custo relativo.

export type LlmProvider = 'lovable' | 'anthropic' | 'openai';
export type LlmTier = 'low' | 'medium' | 'high';

export const ADAPTIVE_MODEL = 'adaptive';

export interface UiModel {
  id: string;
  name: string;
  desc: string;
  tier: LlmTier;
  recommended?: boolean;
}

export interface UiProvider {
  id: LlmProvider;
  name: string;
  desc: string;
  needsKey: boolean;
  defaultModel: string;
  models: UiModel[];
}


export const LLM_PROVIDERS: UiProvider[] = [
  {
    id: 'lovable',
    name: 'Lovable AI',
    desc: 'Padrão — sem chave, cobra créditos do projeto',
    needsKey: false,
    defaultModel: 'google/gemini-3.6-flash',
    models: [
      { id: 'google/gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', desc: 'O mais barato do gateway, alto volume', tier: 'low' },
      { id: 'openai/gpt-5.6-luna', name: 'GPT-5.6 Luna', desc: 'Rápido e econômico, geração atual da OpenAI', tier: 'low' },
      { id: 'google/gemini-3.6-flash', name: 'Gemini 3.6 Flash', desc: 'Padrão atual do gateway, multimodal', tier: 'medium', recommended: true },
      { id: 'openai/gpt-5.6-terra', name: 'GPT-5.6 Terra', desc: 'Equilíbrio capacidade/custo da OpenAI', tier: 'medium' },
      { id: 'google/gemini-3.1-pro-preview', name: 'Gemini 3.1 Pro (preview)', desc: 'Pro mais recente do Google', tier: 'high' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro', desc: 'Pro estável da geração anterior', tier: 'high' },
      { id: 'openai/gpt-5.6-sol', name: 'GPT-5.6 Sol', desc: 'Flagship da OpenAI via gateway', tier: 'high' },
    ],
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    desc: 'Claude — usa sua chave da API Anthropic',
    needsKey: true,
    defaultModel: 'claude-sonnet-5',
    models: [
      { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5', desc: 'Rápido e econômico, ideal para alto volume', tier: 'low' },
      { id: 'claude-sonnet-5', name: 'Claude Sonnet 5', desc: 'Equilíbrio capacidade/custo, ótimo em conversas longas', tier: 'medium', recommended: true },
      { id: 'claude-opus-5', name: 'Claude Opus 5', desc: 'Topo de linha para agentes e raciocínio', tier: 'high' },
      { id: 'claude-fable-5', name: 'Claude Fable 5', desc: 'O mais cognitivo da Anthropic (exige retenção de dados de 30 dias na conta)', tier: 'high' },
    ],
  },
  {
    id: 'openai',
    name: 'OpenAI',
    desc: 'GPT — usa sua chave da API OpenAI',
    needsKey: true,
    defaultModel: 'gpt-5.6-terra',
    models: [
      { id: 'gpt-5.6-luna', name: 'GPT-5.6 Luna', desc: 'Rápido e econômico, ideal para alto volume', tier: 'low' },
      { id: 'gpt-5.6-terra', name: 'GPT-5.6 Terra', desc: 'Equilíbrio entre capacidade e custo', tier: 'medium', recommended: true },
      { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol', desc: 'Flagship da geração atual, raciocínio máximo', tier: 'high' },
    ],
  },
];

