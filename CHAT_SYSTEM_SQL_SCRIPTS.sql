-- ============================================================================
-- SISTEMA DE CHAT - SCRIPTS SQL COMPLETOS PARA NOVO BANCO SUPABASE
-- ============================================================================
-- Autor: Documentação gerada automaticamente
-- Data: 2025-11-25
-- Descrição: Scripts para criar toda a estrutura do sistema de chat WhatsApp
-- ============================================================================

-- ============================================================================
-- PARTE 1: EXTENSÕES NECESSÁRIAS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_net"; -- Para chamadas HTTP assíncronas
CREATE EXTENSION IF NOT EXISTS "http";   -- Para chamadas HTTP síncronas em triggers

-- ============================================================================
-- PARTE 2: ENUMs (TIPOS ENUMERADOS)
-- ============================================================================

-- Status da conversa (gerenciada por Nina ou humano)
CREATE TYPE conversation_status AS ENUM ('nina', 'human', 'paused');

-- Origem da mensagem
CREATE TYPE message_from AS ENUM ('user', 'nina', 'human');

-- Status de entrega da mensagem
CREATE TYPE message_status AS ENUM ('sent', 'delivered', 'read', 'failed', 'processing');

-- Tipo de conteúdo da mensagem
CREATE TYPE message_type AS ENUM ('text', 'audio', 'image', 'document', 'video');

-- Status genérico para filas de processamento
CREATE TYPE queue_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- Atribuição de equipe
CREATE TYPE team_assignment AS ENUM ('mateus', 'igor', 'fe', 'vendas', 'suporte');

-- ============================================================================
-- PARTE 3: TABELAS PRINCIPAIS
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 3.1 CONTACTS - Contatos do WhatsApp
-- -----------------------------------------------------------------------------
CREATE TABLE public.contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificação
    phone_number TEXT NOT NULL,
    whatsapp_id TEXT,
    name TEXT,
    call_name TEXT,                    -- Nome para chamar o cliente
    email TEXT,
    profile_picture_url TEXT,
    
    -- Classificação
    is_business BOOLEAN DEFAULT false,
    is_blocked BOOLEAN DEFAULT false,
    blocked_at TIMESTAMPTZ,
    blocked_reason TEXT,
    tags TEXT[] DEFAULT '{}',
    notes TEXT,
    
    -- Memória do cliente (contexto para IA)
    client_memory JSONB DEFAULT '{
        "last_updated": null,
        "lead_profile": {
            "interests": [],
            "lead_stage": "new",
            "objections": [],
            "products_discussed": [],
            "communication_style": "unknown",
            "qualification_score": 0
        },
        "sales_intelligence": {
            "pain_points": [],
            "next_best_action": "qualify",
            "budget_indication": "unknown",
            "decision_timeline": "unknown"
        },
        "interaction_summary": {
            "response_pattern": "unknown",
            "last_contact_reason": "",
            "total_conversations": 0,
            "preferred_contact_time": "unknown"
        },
        "conversation_history": []
    }'::jsonb,
    
    -- Timestamps
    first_contact_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    -- Constraints
    CONSTRAINT contacts_phone_number_unique UNIQUE (phone_number)
);

-- Índices para contacts
CREATE INDEX idx_contacts_phone_number ON public.contacts(phone_number);
CREATE INDEX idx_contacts_whatsapp_id ON public.contacts(whatsapp_id);
CREATE INDEX idx_contacts_is_blocked ON public.contacts(is_blocked);
CREATE INDEX idx_contacts_last_activity ON public.contacts(last_activity DESC);
CREATE INDEX idx_contacts_tags ON public.contacts USING GIN(tags);
CREATE INDEX idx_contacts_created_at ON public.contacts(created_at DESC);

-- -----------------------------------------------------------------------------
-- 3.2 CONVERSATIONS - Sessões de conversa
-- -----------------------------------------------------------------------------
CREATE TABLE public.conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relacionamento
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    
    -- Status e atribuição
    status conversation_status NOT NULL DEFAULT 'nina',
    is_active BOOLEAN NOT NULL DEFAULT true,
    assigned_team team_assignment,
    assigned_user_id UUID,
    
    -- Contexto
    tags TEXT[] DEFAULT '{}',
    nina_context JSONB DEFAULT '{}',      -- Contexto acumulado da conversa
    metadata JSONB DEFAULT '{}',           -- Metadados extras
    
    -- Timestamps
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para conversations
CREATE INDEX idx_conversations_contact_id ON public.conversations(contact_id);
CREATE INDEX idx_conversations_status ON public.conversations(status);
CREATE INDEX idx_conversations_is_active ON public.conversations(is_active);
CREATE INDEX idx_conversations_last_message_at ON public.conversations(last_message_at DESC);
CREATE INDEX idx_conversations_tags ON public.conversations USING GIN(tags);
CREATE INDEX idx_conversations_created_at ON public.conversations(created_at DESC);

-- -----------------------------------------------------------------------------
-- 3.3 MESSAGES - Mensagens individuais
-- -----------------------------------------------------------------------------
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relacionamento
    conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
    reply_to_id UUID REFERENCES public.messages(id),
    
    -- Identificação WhatsApp
    whatsapp_message_id TEXT,
    
    -- Conteúdo
    type message_type NOT NULL DEFAULT 'text',
    from_type message_from NOT NULL,
    content TEXT,
    media_url TEXT,
    media_type TEXT,
    
    -- Status
    status message_status NOT NULL DEFAULT 'sent',
    processed_by_nina BOOLEAN DEFAULT false,
    nina_response_time INTEGER,            -- Tempo de resposta em ms
    
    -- Metadados
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices para messages
CREATE INDEX idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX idx_messages_whatsapp_message_id ON public.messages(whatsapp_message_id);
CREATE INDEX idx_messages_from_type ON public.messages(from_type);
CREATE INDEX idx_messages_sent_at ON public.messages(sent_at DESC);
CREATE INDEX idx_messages_status ON public.messages(status);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);

-- -----------------------------------------------------------------------------
-- 3.4 CONVERSATION_STATES - Estado da máquina de estados da conversa
-- -----------------------------------------------------------------------------
CREATE TABLE public.conversation_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relacionamento (1:1)
    conversation_id UUID NOT NULL UNIQUE REFERENCES public.conversations(id) ON DELETE CASCADE,
    
    -- Estado atual
    current_state TEXT NOT NULL DEFAULT 'idle',
    last_action TEXT,
    last_action_at TIMESTAMPTZ,
    
    -- Contexto de agendamento (quando em fluxo de booking)
    scheduling_context JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_conversation_states_conversation_id ON public.conversation_states(conversation_id);
CREATE INDEX idx_conversation_states_current_state ON public.conversation_states(current_state);

-- ============================================================================
-- PARTE 4: TABELAS DE FILAS (QUEUES)
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 4.1 MESSAGE_GROUPING_QUEUE - Agrupa mensagens rápidas do mesmo usuário
-- -----------------------------------------------------------------------------
CREATE TABLE public.message_grouping_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificação
    whatsapp_message_id TEXT NOT NULL,
    phone_number_id TEXT NOT NULL,
    
    -- Dados
    message_data JSONB NOT NULL,
    contacts_data JSONB,
    
    -- Status
    processed BOOLEAN NOT NULL DEFAULT false,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_message_grouping_queue_processed ON public.message_grouping_queue(processed);
CREATE INDEX idx_message_grouping_queue_phone_number_id ON public.message_grouping_queue(phone_number_id);
CREATE INDEX idx_message_grouping_queue_created_at ON public.message_grouping_queue(created_at);

-- -----------------------------------------------------------------------------
-- 4.2 MESSAGE_PROCESSING_QUEUE - Fila de processamento de mensagens brutas
-- -----------------------------------------------------------------------------
CREATE TABLE public.message_processing_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificação
    whatsapp_message_id TEXT NOT NULL,
    phone_number_id TEXT NOT NULL,
    
    -- Dados brutos do webhook
    raw_data JSONB NOT NULL,
    
    -- Status da fila
    status queue_status NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 1,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    
    -- Agendamento
    scheduled_for TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_message_processing_queue_status ON public.message_processing_queue(status);
CREATE INDEX idx_message_processing_queue_scheduled_for ON public.message_processing_queue(scheduled_for);
CREATE INDEX idx_message_processing_queue_priority ON public.message_processing_queue(priority DESC);

-- -----------------------------------------------------------------------------
-- 4.3 NINA_PROCESSING_QUEUE - Fila de processamento pela IA Nina
-- -----------------------------------------------------------------------------
CREATE TABLE public.nina_processing_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relacionamentos
    message_id UUID NOT NULL,
    conversation_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    
    -- Contexto para processamento
    context_data JSONB,
    
    -- Status da fila
    status queue_status NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 1,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    
    -- Agendamento
    scheduled_for TIMESTAMPTZ DEFAULT now(),
    processed_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_nina_processing_queue_status ON public.nina_processing_queue(status);
CREATE INDEX idx_nina_processing_queue_message_id ON public.nina_processing_queue(message_id);
CREATE INDEX idx_nina_processing_queue_conversation_id ON public.nina_processing_queue(conversation_id);
CREATE INDEX idx_nina_processing_queue_scheduled_for ON public.nina_processing_queue(scheduled_for);
CREATE INDEX idx_nina_processing_queue_priority ON public.nina_processing_queue(priority DESC);

-- -----------------------------------------------------------------------------
-- 4.4 SEND_QUEUE - Fila de envio de mensagens via WhatsApp
-- -----------------------------------------------------------------------------
CREATE TABLE public.send_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relacionamentos
    conversation_id UUID NOT NULL,
    contact_id UUID NOT NULL,
    
    -- Conteúdo
    message_type TEXT NOT NULL DEFAULT 'text',
    from_type TEXT NOT NULL DEFAULT 'nina',
    content TEXT,
    media_url TEXT,
    
    -- Metadados
    metadata JSONB DEFAULT '{}',
    
    -- Status da fila
    status queue_status NOT NULL DEFAULT 'pending',
    priority INTEGER NOT NULL DEFAULT 1,
    retry_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    
    -- Agendamento
    scheduled_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_send_queue_status ON public.send_queue(status);
CREATE INDEX idx_send_queue_contact_id ON public.send_queue(contact_id);
CREATE INDEX idx_send_queue_conversation_id ON public.send_queue(conversation_id);
CREATE INDEX idx_send_queue_scheduled_at ON public.send_queue(scheduled_at);
CREATE INDEX idx_send_queue_priority ON public.send_queue(priority DESC);

-- ============================================================================
-- PARTE 5: TABELAS DE CONFIGURAÇÃO
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 5.1 NINA_SETTINGS - Configurações globais do sistema
-- -----------------------------------------------------------------------------
CREATE TABLE public.nina_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- IA (via Lovable AI Gateway - não requer API key própria)
    -- Campos openai_* removidos - sistema usa Lovable AI Gateway (Gemini/GPT)
    system_prompt_override TEXT,
    test_system_prompt TEXT,
    ai_model_mode TEXT DEFAULT 'flash',        -- flash, pro, etc.
    
    -- ElevenLabs (TTS)
    elevenlabs_api_key TEXT,
    elevenlabs_voice_id TEXT NOT NULL DEFAULT '9BWtsMINqrJLrRacOk9x',
    elevenlabs_model TEXT DEFAULT 'eleven_turbo_v2_5',
    elevenlabs_stability NUMERIC NOT NULL DEFAULT 0.75,
    elevenlabs_similarity_boost NUMERIC NOT NULL DEFAULT 0.80,
    elevenlabs_style NUMERIC NOT NULL DEFAULT 0.30,
    elevenlabs_speaker_boost BOOLEAN NOT NULL DEFAULT true,
    elevenlabs_speed NUMERIC DEFAULT 1.0,
    audio_response_enabled BOOLEAN DEFAULT false,
    
    -- WhatsApp Cloud API
    whatsapp_access_token TEXT,
    whatsapp_phone_number_id TEXT,
    whatsapp_business_account_id TEXT,
    whatsapp_verify_token TEXT DEFAULT 'viver-de-ia-nina-webhook',
    
    -- Agendamento (nativo via Nina, sem Cal.com)
    
    -- Configurações de resposta
    auto_response_enabled BOOLEAN NOT NULL DEFAULT true,
    adaptive_response_enabled BOOLEAN NOT NULL DEFAULT true,
    message_breaking_enabled BOOLEAN NOT NULL DEFAULT true,
    response_delay_min INTEGER NOT NULL DEFAULT 1000,
    response_delay_max INTEGER NOT NULL DEFAULT 3000,
    
    -- Horário comercial
    timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    business_hours_start TIME NOT NULL DEFAULT '09:00:00',
    business_hours_end TIME NOT NULL DEFAULT '18:00:00',
    business_days INTEGER[] NOT NULL DEFAULT '{1,2,3,4,5}',
    
    -- Flags de features
    async_booking_enabled BOOLEAN DEFAULT false,
    route_all_to_receiver_enabled BOOLEAN NOT NULL DEFAULT false,
    
    -- Telefones de teste
    test_phone_numbers JSONB,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índice
CREATE INDEX idx_nina_settings_is_active ON public.nina_settings(is_active);

-- Inserir configuração padrão
INSERT INTO public.nina_settings (is_active) VALUES (true);

-- -----------------------------------------------------------------------------
-- 5.2 TAG_DEFINITIONS - Definições de tags disponíveis
-- -----------------------------------------------------------------------------
CREATE TABLE public.tag_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identificação
    key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    
    -- Visual
    color TEXT NOT NULL DEFAULT '#3b82f6',
    category TEXT NOT NULL DEFAULT 'custom',
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT true,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX idx_tag_definitions_key ON public.tag_definitions(key);
CREATE INDEX idx_tag_definitions_category ON public.tag_definitions(category);

-- ============================================================================
-- PARTE 6: VIEWS
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 6.1 CONTACTS_WITH_STATS - Contatos com estatísticas de mensagens
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.contacts_with_stats AS
SELECT 
    c.*,
    COALESCE(msg_stats.total_messages, 0) AS total_messages,
    COALESCE(msg_stats.nina_messages, 0) AS nina_messages,
    COALESCE(msg_stats.user_messages, 0) AS user_messages,
    COALESCE(msg_stats.human_messages, 0) AS human_messages
FROM public.contacts c
LEFT JOIN (
    SELECT 
        conv.contact_id,
        COUNT(m.id) AS total_messages,
        COUNT(CASE WHEN m.from_type = 'nina' THEN 1 END) AS nina_messages,
        COUNT(CASE WHEN m.from_type = 'user' THEN 1 END) AS user_messages,
        COUNT(CASE WHEN m.from_type = 'human' THEN 1 END) AS human_messages
    FROM public.conversations conv
    JOIN public.messages m ON m.conversation_id = conv.id
    GROUP BY conv.contact_id
) msg_stats ON msg_stats.contact_id = c.id;

-- ============================================================================
-- PARTE 7: FUNÇÕES DO BANCO DE DADOS
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 7.1 Função genérica para atualizar updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- -----------------------------------------------------------------------------
-- 7.2 Atualiza last_message_at da conversa e last_activity do contato
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_conversation_last_message()
RETURNS TRIGGER AS $$
BEGIN
    -- Atualiza conversa
    UPDATE public.conversations 
    SET last_message_at = NEW.sent_at
    WHERE id = NEW.conversation_id;
    
    -- Atualiza contato
    UPDATE public.contacts 
    SET last_activity = NEW.sent_at
    WHERE id = (
        SELECT contact_id 
        FROM public.conversations 
        WHERE id = NEW.conversation_id
    );
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- -----------------------------------------------------------------------------
-- 7.3 Obtém ou cria estado da conversa
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_conversation_state(p_conversation_id UUID)
RETURNS conversation_states AS $$
DECLARE
    state_record public.conversation_states;
BEGIN
    SELECT * INTO state_record
    FROM public.conversation_states
    WHERE conversation_id = p_conversation_id;
    
    IF NOT FOUND THEN
        INSERT INTO public.conversation_states (conversation_id, current_state)
        VALUES (p_conversation_id, 'idle')
        RETURNING * INTO state_record;
    END IF;
    
    RETURN state_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 7.4 Atualiza estado da conversa
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_conversation_state(
    p_conversation_id UUID, 
    p_new_state TEXT, 
    p_action TEXT DEFAULT NULL, 
    p_context JSONB DEFAULT NULL
)
RETURNS conversation_states AS $$
DECLARE
    state_record public.conversation_states;
BEGIN
    INSERT INTO public.conversation_states (
        conversation_id, current_state, last_action, last_action_at, scheduling_context
    )
    VALUES (
        p_conversation_id, p_new_state, p_action, now(), COALESCE(p_context, '{}')
    )
    ON CONFLICT (conversation_id) 
    DO UPDATE SET
        current_state = EXCLUDED.current_state,
        last_action = EXCLUDED.last_action,
        last_action_at = EXCLUDED.last_action_at,
        scheduling_context = CASE 
            WHEN EXCLUDED.scheduling_context = '{}' THEN conversation_states.scheduling_context
            ELSE EXCLUDED.scheduling_context
        END,
        updated_at = now()
    RETURNING * INTO state_record;
    
    RETURN state_record;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 7.5 Atualiza client_memory do contato
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_client_memory(p_contact_id UUID, p_new_memory JSONB)
RETURNS VOID AS $$
BEGIN
    UPDATE public.contacts 
    SET client_memory = p_new_memory, updated_at = now()
    WHERE id = p_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- -----------------------------------------------------------------------------
-- 7.6 Claim batch para nina_processing_queue (processamento atômico)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_nina_processing_batch(p_limit INTEGER DEFAULT 50)
RETURNS SETOF nina_processing_queue AS $$
BEGIN
    RETURN QUERY
    WITH cte AS (
        SELECT id
        FROM public.nina_processing_queue
        WHERE status = 'pending'
          AND (scheduled_for IS NULL OR scheduled_for <= now())
        ORDER BY priority DESC, scheduled_for ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.nina_processing_queue n
    SET status = 'processing', updated_at = now()
    WHERE n.id IN (SELECT id FROM cte)
    RETURNING n.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- -----------------------------------------------------------------------------
-- 7.7 Claim batch para send_queue (processamento atômico)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_send_queue_batch(p_limit INTEGER DEFAULT 10)
RETURNS SETOF send_queue AS $$
BEGIN
    RETURN QUERY
    WITH cte AS (
        SELECT id
        FROM public.send_queue
        WHERE status = 'pending'
          AND (scheduled_at IS NULL OR scheduled_at <= now())
        ORDER BY priority DESC, scheduled_at ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.send_queue s
    SET status = 'processing', updated_at = now()
    WHERE s.id IN (SELECT id FROM cte)
    RETURNING s.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- -----------------------------------------------------------------------------
-- 7.8 Claim batch para message_processing_queue
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_message_processing_batch(p_limit INTEGER DEFAULT 50)
RETURNS SETOF message_processing_queue AS $$
BEGIN
    RETURN QUERY
    WITH cte AS (
        SELECT id
        FROM public.message_processing_queue
        WHERE status = 'pending'
          AND (scheduled_for IS NULL OR scheduled_for <= now())
        ORDER BY priority DESC, scheduled_for ASC NULLS FIRST, created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT p_limit
    )
    UPDATE public.message_processing_queue m
    SET status = 'processing', updated_at = now()
    WHERE m.id IN (SELECT id FROM cte)
    RETURNING m.*;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- -----------------------------------------------------------------------------
-- 7.9 Limpeza de filas processadas
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_processed_queues()
RETURNS VOID AS $$
BEGIN
    -- Limpar completados > 24h
    DELETE FROM public.message_processing_queue 
    WHERE status = 'completed' AND processed_at < now() - interval '24 hours';
    
    DELETE FROM public.nina_processing_queue 
    WHERE status = 'completed' AND processed_at < now() - interval '24 hours';
    
    DELETE FROM public.send_queue 
    WHERE status = 'completed' AND sent_at < now() - interval '24 hours';
    
    -- Limpar falhas > 7 dias
    DELETE FROM public.message_processing_queue 
    WHERE status = 'failed' AND updated_at < now() - interval '7 days';
    
    DELETE FROM public.nina_processing_queue 
    WHERE status = 'failed' AND updated_at < now() - interval '7 days';
    
    DELETE FROM public.send_queue 
    WHERE status = 'failed' AND updated_at < now() - interval '7 days';
END;
$$ LANGUAGE plpgsql;

-- -----------------------------------------------------------------------------
-- 7.10 Limpeza de message_grouping_queue
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_processed_message_queue()
RETURNS VOID AS $$
BEGIN
    DELETE FROM public.message_grouping_queue 
    WHERE processed = true AND created_at < now() - interval '1 hour';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- PARTE 8: FUNÇÕES PARA TRIGGERS HTTP (chamam Edge Functions)
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 8.1 Auto-start nina-orchestrator quando nova mensagem entra na fila
-- -----------------------------------------------------------------------------
-- NOTA: Esta função faz chamada HTTP para a Edge Function.
-- Você precisa atualizar a URL e tokens conforme seu projeto Supabase.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_start_nina_orchestrator()
RETURNS TRIGGER AS $$
DECLARE
    trigger_url TEXT;
    json_payload TEXT;
    http_request http_request;
    http_result http_response;
BEGIN
    IF TG_OP <> 'INSERT' OR NEW.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    -- URL da Edge Function trigger (atualizar conforme seu projeto)
    trigger_url := 'https://SEU_PROJECT_REF.supabase.co/functions/v1/trigger-nina-orchestrator';

    json_payload := jsonb_build_object(
        'message_id', NEW.message_id,
        'triggered_by', 'db_trigger_insert'
    )::text;

    http_request := (
        'POST',
        trigger_url,
        ARRAY[http_header('Content-Type', 'application/json')],
        'application/json',
        json_payload
    );

    BEGIN
        http_result := public.http(http_request);
        RAISE NOTICE 'trigger-nina-orchestrator respondeu: %', http_result.status;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Erro ao chamar trigger-nina-orchestrator: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 8.2 Auto-start whatsapp-sender quando nova mensagem entra na send_queue
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auto_start_whatsapp_sender()
RETURNS TRIGGER AS $$
DECLARE
    trigger_url TEXT;
    json_payload TEXT;
    http_request http_request;
    http_result http_response;
    whatsapp_token TEXT;
BEGIN
    IF TG_OP <> 'INSERT' OR NEW.status <> 'pending' THEN
        RETURN NEW;
    END IF;

    -- URL da Edge Function (atualizar conforme seu projeto)
    trigger_url := 'https://SEU_PROJECT_REF.supabase.co/functions/v1/trigger-whatsapp-sender';
    
    whatsapp_token := current_setting('app.settings.whatsapp_trigger_token', true);
    IF whatsapp_token IS NULL OR whatsapp_token = '' THEN
        whatsapp_token := 'whatsapp_internal_trigger_token';
    END IF;

    json_payload := jsonb_build_object(
        'action', 'start',
        'triggered_by', 'db_trigger_insert',
        'queue_id', NEW.id,
        'contact_id', NEW.contact_id,
        'timestamp', NOW()
    )::text;

    http_request := (
        'POST',
        trigger_url,
        ARRAY[
            http_header('x-internal-token', whatsapp_token),
            http_header('Content-Type', 'application/json')
        ],
        'application/json',
        json_payload
    );

    BEGIN
        http_result := public.http(http_request);
        RAISE NOTICE 'trigger-whatsapp-sender respondeu: %', http_result.status;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Erro ao chamar trigger-whatsapp-sender: %', SQLERRM;
    END;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PARTE 9: TRIGGERS
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 9.1 Triggers de updated_at automático
-- -----------------------------------------------------------------------------
CREATE TRIGGER update_contacts_updated_at
    BEFORE UPDATE ON public.contacts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON public.conversations
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_conversation_states_updated_at
    BEFORE UPDATE ON public.conversation_states
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_nina_processing_queue_updated_at
    BEFORE UPDATE ON public.nina_processing_queue
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_message_processing_queue_updated_at
    BEFORE UPDATE ON public.message_processing_queue
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_send_queue_updated_at
    BEFORE UPDATE ON public.send_queue
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_nina_settings_updated_at
    BEFORE UPDATE ON public.nina_settings
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tag_definitions_updated_at
    BEFORE UPDATE ON public.tag_definitions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -----------------------------------------------------------------------------
-- 9.2 Trigger para atualizar last_message_at da conversa
-- -----------------------------------------------------------------------------
CREATE TRIGGER update_conversation_last_message_trigger
    AFTER INSERT ON public.messages
    FOR EACH ROW EXECUTE FUNCTION public.update_conversation_last_message();

-- -----------------------------------------------------------------------------
-- 9.3 Trigger para auto-start do nina-orchestrator
-- -----------------------------------------------------------------------------
CREATE TRIGGER trigger_auto_start_nina_orchestrator
    AFTER INSERT ON public.nina_processing_queue
    FOR EACH ROW EXECUTE FUNCTION public.auto_start_nina_orchestrator();

-- -----------------------------------------------------------------------------
-- 9.4 Trigger para auto-start do whatsapp-sender
-- -----------------------------------------------------------------------------
CREATE TRIGGER trigger_auto_start_whatsapp_sender
    AFTER INSERT ON public.send_queue
    FOR EACH ROW EXECUTE FUNCTION public.auto_start_whatsapp_sender();

-- ============================================================================
-- PARTE 10: ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_grouping_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nina_processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.send_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nina_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_definitions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- Políticas permissivas (ajustar conforme necessidade de segurança)
-- Para produção, considere políticas mais restritivas baseadas em auth.uid()
-- -----------------------------------------------------------------------------

-- Contacts
CREATE POLICY "Allow all operations on contacts" ON public.contacts
    FOR ALL USING (true) WITH CHECK (true);

-- Conversations
CREATE POLICY "Allow all operations on conversations" ON public.conversations
    FOR ALL USING (true) WITH CHECK (true);

-- Messages
CREATE POLICY "Allow all operations on messages" ON public.messages
    FOR ALL USING (true) WITH CHECK (true);

-- Conversation States
CREATE POLICY "Allow all operations on conversation_states" ON public.conversation_states
    FOR ALL USING (true) WITH CHECK (true);

-- Message Grouping Queue
CREATE POLICY "Allow all operations on message_grouping_queue" ON public.message_grouping_queue
    FOR ALL USING (true) WITH CHECK (true);

-- Message Processing Queue
CREATE POLICY "Allow all operations on message_processing_queue" ON public.message_processing_queue
    FOR ALL USING (true) WITH CHECK (true);

-- Nina Processing Queue
CREATE POLICY "Allow all operations on nina_processing_queue" ON public.nina_processing_queue
    FOR ALL USING (true) WITH CHECK (true);

-- Send Queue
CREATE POLICY "Allow all operations on send_queue" ON public.send_queue
    FOR ALL USING (true) WITH CHECK (true);

-- Nina Settings
CREATE POLICY "Allow all operations on nina_settings" ON public.nina_settings
    FOR ALL USING (true) WITH CHECK (true);

-- Tag Definitions
CREATE POLICY "Allow all operations on tag_definitions" ON public.tag_definitions
    FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- PARTE 11: GRANTS (Permissões para roles do Supabase)
-- ============================================================================

-- Conceder permissões para anon e authenticated
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- ============================================================================
-- NOTAS IMPORTANTES PARA IMPLEMENTAÇÃO
-- ============================================================================
-- 
-- 1. ATUALIZAR URLs DAS EDGE FUNCTIONS:
--    - Nas funções auto_start_nina_orchestrator() e auto_start_whatsapp_sender()
--    - Substituir 'SEU_PROJECT_REF' pelo ref do seu projeto Supabase
--
-- 2. EDGE FUNCTIONS NECESSÁRIAS:
--    - whatsapp-webhook: Recebe webhooks do WhatsApp
--    - trigger-nina-orchestrator: Proxy para chamar nina-orchestrator
--    - nina-orchestrator: Processa mensagens com IA
--    - trigger-whatsapp-sender: Proxy para chamar whatsapp-sender-v2
--    - whatsapp-sender-v2: Envia mensagens via WhatsApp Cloud API
--
-- 3. SECRETS NECESSÁRIOS NO SUPABASE:
--    - LOVABLE_API_KEY (para Lovable AI Gateway)
--    - ELEVENLABS_API_KEY (opcional, para respostas em áudio)
--    Nota: Credenciais WhatsApp são salvas na tabela nina_settings
--    Nota: Agendamento é nativo via Nina (sem Cal.com)
--
-- 4. CRON JOBS RECOMENDADOS (via pg_cron ou Supabase Crons):
--    - cleanup_processed_queues(): A cada 1 hora
--    - cleanup_processed_message_queue(): A cada 30 minutos
--
-- ============================================================================
