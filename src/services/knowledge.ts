import { supabase } from '@/integrations/supabase/client';
import { currentWorkspaceId } from './workspace';
import { chunkContent } from '@/domain/knowledge';

export { chunkContent, parseFaqPairs } from '@/domain/knowledge';

// Tabelas novas ainda não estão nos types gerados do Supabase — cast local.
const db = supabase as any;

export interface KnowledgeFact {
  id: string;
  workspace_id: string;
  title: string;
  category: string;
  question: string | null;
  fact: string;
  source: string | null;
  is_active: boolean;
  always_include: boolean;
  status: 'draft' | 'confirmed' | 'needs_review' | 'expired' | 'archived';
  confirmed_by: string | null;
  confirmed_at: string | null;
  valid_from: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KnowledgeDocument {
  id: string;
  workspace_id: string;
  title: string;
  content: string;
  doc_type: 'texto' | 'faq' | 'url';
  is_active: boolean;
  status: 'processing' | 'approved' | 'needs_review' | 'error' | 'archived';
  source_url: string | null;
  fingerprint: string | null;
  ingestion_report: Record<string, unknown>;
  error_message: string | null;
  chunk_count: number;
  created_at: string;
  updated_at: string;
}

export interface UnansweredQuestion {
  id: string;
  workspace_id: string;
  conversation_id: string | null;
  contact_id: string | null;
  question: string;
  context: string | null;
  status: 'open' | 'resolved' | 'ignored';
  kind: 'question' | 'conflict' | 'unreadable_document' | 'expired_fact';
  metadata: Record<string, unknown>;
  resolved_fact_id: string | null;
  created_at: string;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value.normalize('NFKC').trim());
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function existingFact(workspaceId: string, title: string, fact: string): Promise<KnowledgeFact | null> {
  const { data, error } = await db
    .from('knowledge_facts')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('title', title)
    .eq('fact', fact)
    .neq('status', 'archived')
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function existingDocument(workspaceId: string, fingerprint: string): Promise<KnowledgeDocument | null> {
  const { data, error } = await db
    .from('knowledge_documents')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('fingerprint', fingerprint)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function writeDocument(input: {
  id?: string | null;
  title: string;
  content: string;
  doc_type: 'texto' | 'faq' | 'url';
  source_url?: string | null;
  status: KnowledgeDocument['status'];
  is_active: boolean;
  ingestion_report?: Record<string, unknown>;
  error_message?: string | null;
}): Promise<KnowledgeDocument> {
  const chunks = chunkContent(input.content).filter((chunk) => chunk.trim().length > 0);
  const fingerprint = await sha256(`${input.doc_type}\n${input.source_url ?? ''}\n${input.content}`);
  const { data, error } = await db.rpc('write_knowledge_document', {
    _document_id: input.id ?? null,
    _title: input.title,
    _content: input.content,
    _doc_type: input.doc_type,
    _source_url: input.source_url ?? null,
    _fingerprint: fingerprint,
    _status: input.status,
    _is_active: input.is_active,
    _ingestion_report: {
      chunks_created: chunks.length,
      characters_read: input.content.length,
      unreadable_parts: [],
      conflicts: [],
      ...(input.ingestion_report ?? {}),
    },
    _error_message: input.error_message ?? null,
    _chunks: chunks,
  });
  if (error) throw error;
  const document = Array.isArray(data) ? data[0] : data;
  if (!document) throw new Error('O banco não retornou o material gravado.');
  return document as KnowledgeDocument;
}

export interface KnowledgeSearchHit {
  source_type: 'fact' | 'chunk';
  source_id: string;
  title: string;
  content: string;
  rank: number;
}

export interface SimulatorGrounding {
  searches: Array<{ query: string; results: Array<{ source_type: string; title: string; content: string; rank: number }> }>;
  unanswered: Array<{ pergunta: string; contexto?: string }>;
  tool_events: Array<{ tool: string; args: any; ok: boolean; summary?: string }>;
}

export interface SimulatorResponse {
  reply: string;
  grounding: SimulatorGrounding;
  model: string;
  facts_in_prompt: number;
  iterations: number;
}

export const knowledgeApi = {
  // ---- Fatos canônicos ----
  async fetchFacts(): Promise<KnowledgeFact[]> {
    const { data, error } = await db
      .from('knowledge_facts')
      .select('*')
      .order('category')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  // Insert em lote numa única request: importação de FAQ não pode ficar pela
  // metade se a rede cair no meio (retry duplicaria o que já entrou)
  async createFactsBulk(
    inputs: Array<{ title?: string; category: string; question?: string | null; fact: string; source?: string | null; always_include?: boolean }>,
  ): Promise<void> {
    if (inputs.length === 0) return;
    const workspaceId = await currentWorkspaceId();
    const { error } = await db.from('knowledge_facts').insert(
      inputs.map((i) => ({
        workspace_id: workspaceId,
        title: i.title || i.question || i.category || 'Informação confirmada',
        category: i.category || 'geral',
        question: i.question || null,
        fact: i.fact,
        source: i.source || null,
        always_include: i.always_include ?? false,
      })),
    );
    if (error) throw error;
  },

  async createFact(input: { title?: string; category: string; question?: string | null; fact: string; source?: string | null; always_include?: boolean; expires_at?: string | null }): Promise<KnowledgeFact> {
    const workspaceId = await currentWorkspaceId();
    const title = input.title || input.question || input.category || 'Informação confirmada';
    const duplicate = await existingFact(workspaceId, title, input.fact);
    if (duplicate) {
      const { data, error } = await db.from('knowledge_facts').update({
        category: input.category || duplicate.category,
        question: input.question || duplicate.question,
        source: input.source || duplicate.source,
        always_include: input.always_include ?? true,
        is_active: true,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        expires_at: input.expires_at ?? duplicate.expires_at,
      }).eq('id', duplicate.id).select().single();
      if (error) throw error;
      return data;
    }
    const { data, error } = await db
      .from('knowledge_facts')
      .insert({
        workspace_id: workspaceId,
        title,
        category: input.category || 'geral',
        question: input.question || null,
        fact: input.fact,
        source: input.source || null,
        always_include: input.always_include ?? true,
        status: 'confirmed',
        confirmed_at: new Date().toISOString(),
        expires_at: input.expires_at ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async createFactSuggestion(input: {
    title: string;
    category: string;
    fact: string;
    source?: string | null;
    question?: string | null;
  }): Promise<KnowledgeFact> {
    const workspaceId = await currentWorkspaceId();
    const duplicate = await existingFact(workspaceId, input.title, input.fact);
    if (duplicate) return duplicate;
    const { data, error } = await db
      .from('knowledge_facts')
      .insert({
        workspace_id: workspaceId,
        title: input.title,
        category: input.category || 'geral',
        question: input.question || null,
        fact: input.fact,
        source: input.source || null,
        always_include: false,
        is_active: false,
        status: 'needs_review',
        confirmed_by: null,
        confirmed_at: null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateFact(id: string, updates: Partial<Pick<KnowledgeFact, 'title' | 'category' | 'question' | 'fact' | 'source' | 'is_active' | 'always_include' | 'status' | 'expires_at'>>): Promise<void> {
    const { error } = await db.from('knowledge_facts').update(updates).eq('id', id);
    if (error) throw error;
  },

  async confirmFact(id: string): Promise<void> {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    const { error } = await db.from('knowledge_facts').update({
      status: 'confirmed',
      is_active: true,
      always_include: true,
      confirmed_by: userData.user?.id ?? null,
      confirmed_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;
  },

  async deleteFact(id: string): Promise<void> {
    const { error } = await db.from('knowledge_facts').delete().eq('id', id);
    if (error) throw error;
  },

  // ---- Documentos ----
  async fetchDocuments(): Promise<KnowledgeDocument[]> {
    const { data, error } = await db
      .from('knowledge_documents')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  },

  async createDocument(input: { title: string; content: string; doc_type?: 'texto' | 'faq' | 'url'; source_url?: string | null }): Promise<KnowledgeDocument> {
    const workspaceId = await currentWorkspaceId();
    const fingerprint = await sha256(`${input.doc_type ?? 'texto'}\n${input.source_url ?? ''}\n${input.content}`);
    const duplicate = await existingDocument(workspaceId, fingerprint);
    if (duplicate) return duplicate;
    return writeDocument({
      title: input.title,
      content: input.content,
      doc_type: input.doc_type ?? 'texto',
      source_url: input.source_url,
      status: 'approved',
      is_active: true,
    });
  },

  async createDocumentForReview(input: {
    title: string;
    content: string;
    doc_type?: 'texto' | 'faq' | 'url';
    source_url?: string | null;
    ingestion_report?: Record<string, unknown>;
    error_message?: string | null;
  }): Promise<KnowledgeDocument> {
    const workspaceId = await currentWorkspaceId();
    const fingerprint = await sha256(`${input.doc_type ?? 'texto'}\n${input.source_url ?? ''}\n${input.content}`);
    const duplicate = await existingDocument(workspaceId, fingerprint);
    if (duplicate) return duplicate;
    const hasReadableContent = input.content.trim().length > 0;
    return writeDocument({
      title: input.title,
      content: input.content,
      doc_type: input.doc_type ?? 'texto',
      source_url: input.source_url,
      status: hasReadableContent ? 'needs_review' : 'error',
      is_active: false,
      error_message: input.error_message ?? (hasReadableContent ? null : 'Nenhum conteúdo legível foi extraído.'),
      ingestion_report: input.ingestion_report,
    });
  },

  async approveDocument(id: string): Promise<void> {
    const { error } = await db
      .from('knowledge_documents')
      .update({ status: 'approved', is_active: true, error_message: null })
      .eq('id', id);
    if (error) throw error;
  },

  async updateDocument(id: string, input: { title: string; content: string; doc_type?: 'texto' | 'faq' | 'url'; source_url?: string | null }): Promise<void> {
    await writeDocument({
      id,
      title: input.title,
      content: input.content,
      doc_type: input.doc_type ?? 'texto',
      source_url: input.source_url,
      status: 'approved',
      is_active: true,
    });
  },

  async deleteDocument(id: string): Promise<void> {
    const { error } = await db.from('knowledge_documents').delete().eq('id', id);
    if (error) throw error;
  },

  async toggleDocument(id: string, isActive: boolean): Promise<void> {
    const { error } = await db.from('knowledge_documents').update({ is_active: isActive }).eq('id', id);
    if (error) throw error;
  },

  // ---- Perguntas sem resposta ----
  async fetchUnanswered(status?: 'open' | 'resolved' | 'ignored'): Promise<UnansweredQuestion[]> {
    let query = db.from('unanswered_questions').select('*').order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  },

  async resolveUnanswered(id: string, factId?: string): Promise<void> {
    const { error } = await db
      .from('unanswered_questions')
      .update({ status: 'resolved', resolved_fact_id: factId ?? null })
      .eq('id', id);
    if (error) throw error;
  },

  async ignoreUnanswered(id: string): Promise<void> {
    const { error } = await db.from('unanswered_questions').update({ status: 'ignored' }).eq('id', id);
    if (error) throw error;
  },

  async createUnansweredBulk(inputs: Array<{
    question: string;
    context?: string | null;
    kind?: UnansweredQuestion['kind'];
    metadata?: Record<string, unknown>;
  }>): Promise<number> {
    const normalized = inputs
      .map((item) => ({ ...item, question: item.question.trim() }))
      .filter((item) => item.question.length > 0);
    if (normalized.length === 0) return 0;
    const workspaceId = await currentWorkspaceId();
    const questions = Array.from(new Set(normalized.map((item) => item.question)));
    const { data: existing, error: existingError } = await db
      .from('unanswered_questions')
      .select('question, kind')
      .eq('workspace_id', workspaceId)
      .eq('status', 'open')
      .in('question', questions);
    if (existingError) throw existingError;
    const known = new Set((existing ?? []).map((item: { question: string; kind: string }) => `${item.kind}:${item.question}`));
    const rows = normalized.filter((item) => !known.has(`${item.kind ?? 'question'}:${item.question}`));
    if (rows.length === 0) return 0;
    const { error } = await db.from('unanswered_questions').insert(rows.map((item) => ({
      workspace_id: workspaceId,
      question: item.question,
      context: item.context ?? null,
      kind: item.kind ?? 'question',
      metadata: item.metadata ?? {},
      status: 'open',
    })));
    if (error) throw error;
    return rows.length;
  },

  /**
   * Grava tudo o que a configuração assistida produziu numa única passada segura
   * de repetir: fatos deduplicam por título+conteúdo (uma consulta e uma inserção
   * em lote), documentos pelo fingerprint (o próprio RPC trata corrida na
   * transação) e perguntas contra as que já estão abertas. Os três grupos são
   * independentes e correm em paralelo — assim como os documentos entre si —
   * então o pior caso deixa de ser ~34 idas seriais ao banco. Repetir a chamada
   * após falha parcial não duplica nada.
   */
  async applySetupKnowledge(input: {
    facts: Array<{ title: string; category: string; fact: string; source: string; critical: boolean; decision: 'confirm' | 'suggest' }>;
    documents: Array<{ title: string; content: string; doc_type: 'texto' | 'url'; source_url: string | null; error_message: string | null; ingestion_report: Record<string, unknown> }>;
    unanswered: Array<{ question: string; context?: string | null; kind?: UnansweredQuestion['kind']; metadata?: Record<string, unknown> }>;
  }): Promise<void> {
    const applyFacts = async () => {
      const normalized = input.facts
        .map((item) => ({ ...item, title: item.title.trim(), fact: item.fact.trim() }))
        .filter((item) => item.title.length > 0 && item.fact.length > 0);
      // Fatos idênticos na mesma proposta viram um só (confirmar vence sugerir);
      // sem isso, dois updates concorrentes disputariam o mesmo registro.
      const byKey = new Map<string, typeof normalized[number]>();
      for (const item of normalized) {
        const key = `${item.title}\n${item.fact}`;
        const existing = byKey.get(key);
        if (!existing || (existing.decision === 'suggest' && item.decision === 'confirm')) byKey.set(key, item);
      }
      const facts = [...byKey.values()];
      if (facts.length === 0) return;
      const workspaceId = await currentWorkspaceId();
      const titles = Array.from(new Set(facts.map((item) => item.title)));
      const { data: existing, error: existingError } = await db
        .from('knowledge_facts')
        .select('id, title, fact, category, source')
        .eq('workspace_id', workspaceId)
        .in('title', titles)
        .neq('status', 'archived');
      if (existingError) throw existingError;
      const known = new Map(
        ((existing ?? []) as Array<Pick<KnowledgeFact, 'id' | 'title' | 'fact' | 'category' | 'source'>>)
          .map((row) => [`${row.title}\n${row.fact}`, row]),
      );
      const now = new Date().toISOString();
      const inserts: Array<Record<string, unknown>> = [];
      const confirmations: Array<Promise<void>> = [];
      for (const item of facts) {
        const duplicate = known.get(`${item.title}\n${item.fact}`);
        if (duplicate) {
          if (item.decision === 'confirm') {
            confirmations.push((async () => {
              const { error } = await db.from('knowledge_facts').update({
                category: item.category || duplicate.category,
                source: item.source || duplicate.source,
                always_include: item.critical,
                is_active: true,
                status: 'confirmed',
                confirmed_at: now,
              }).eq('id', duplicate.id);
              if (error) throw error;
            })());
          }
          continue;
        }
        inserts.push(item.decision === 'confirm'
          ? {
            workspace_id: workspaceId,
            title: item.title,
            category: item.category || 'geral',
            fact: item.fact,
            source: item.source || null,
            always_include: item.critical,
            status: 'confirmed',
            confirmed_at: now,
          }
          : {
            workspace_id: workspaceId,
            title: item.title,
            category: item.category || 'geral',
            fact: item.fact,
            source: item.source || null,
            always_include: false,
            is_active: false,
            status: 'needs_review',
          });
      }
      await Promise.all(confirmations);
      if (inserts.length > 0) {
        const { error } = await db.from('knowledge_facts').insert(inserts);
        if (error) throw error;
      }
    };

    const applyDocuments = async () => {
      // Concorrência limitada: o rate limit de ingestão serializa num lock de
      // linha única por hora — 14 transações simultâneas viram um comboio que
      // arrisca statement_timeout. Quatro por vez mantém quase todo o ganho.
      const queue = [...input.documents];
      const failures: unknown[] = [];
      await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
        for (let document = queue.shift(); document; document = queue.shift()) {
          try {
            await knowledgeApi.createDocumentForReview(document);
          } catch (cause) {
            failures.push(cause);
          }
        }
      }));
      if (failures.length > 0) {
        const first = failures[0];
        const detail = first instanceof Error && first.message ? ` (${first.message})` : '';
        throw new Error(`${failures.length} material(is) não puderam ser salvos${detail}.`);
      }
    };

    const groups = await Promise.allSettled([
      applyFacts(),
      applyDocuments(),
      knowledgeApi.createUnansweredBulk(input.unanswered),
    ]);
    const groupLabels = ['os fatos', 'os materiais', 'as perguntas'];
    const failed = groups
      .map((group, index) => (group.status === 'rejected' ? { label: groupLabels[index], reason: group.reason } : null))
      .filter((group): group is { label: string; reason: unknown } => group !== null);
    if (failed.length === 1) throw failed[0].reason;
    if (failed.length > 1) {
      const details = failed
        .map((group) => (group.reason instanceof Error ? group.reason.message : String(group.reason)))
        .join(' · ');
      throw new Error(`Falhas ao salvar ${failed.map((group) => group.label).join(' e ')}: ${details}`);
    }
  },

  // ---- Busca (preview do que a Nina encontra) ----
  async search(query: string, limit = 6): Promise<KnowledgeSearchHit[]> {
    const { data, error } = await db.rpc('search_knowledge', { p_query: query, p_limit: limit });
    if (error) throw error;
    return data ?? [];
  },

  // ---- Simulador ----
  async simulate(messages: Array<{ role: 'user' | 'assistant'; content: string }>, options?: { test_prompt?: string; model_mode?: string; contact_name?: string; profile_context?: string }): Promise<SimulatorResponse> {
    const { data, error } = await supabase.functions.invoke('nina-simulator', {
      body: { messages, ...options },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data as SimulatorResponse;
  },
};
