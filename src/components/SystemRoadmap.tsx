import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  ChevronDown,
  Radio,
  Database,
  Shield,
  RefreshCw,
  Server,
  Webhook,
  KeyRound,
  AlertCircle,
} from 'lucide-react';

// Passos marcados à mão (os que o sistema não consegue detectar sozinho)
const MANUAL_STEPS_KEY = 'nina_system_roadmap_manual_steps';

function loadManualSteps(): string[] {
  try {
    const raw = localStorage.getItem(MANUAL_STEPS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

interface StepDef {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  summary: string;
  content: React.ReactNode;
}

const ease = [0.22, 1, 0.36, 1] as const;

const SystemRoadmap: React.FC = () => {
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [manualDone, setManualDone] = useState<string[]>(loadManualSteps);

  const toggleManual = (id: string) => {
    setManualDone((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      localStorage.setItem(MANUAL_STEPS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const steps: StepDef[] = [
    {
      id: 'realtime',
      icon: Radio,
      title: 'Publicação Realtime',
      summary: 'Tabelas observáveis pelo frontend adicionadas à publicação supabase_realtime.',
      content: (
        <ul className="space-y-2">
          <li>messages, conversations, contacts, deals, appointments, pipeline_stages, teams, team_functions e team_members agem em tempo real no Chat ao vivo, Kanban e Agenda.</li>
          <li>Esta configuração é aplicada automaticamente pela migration de pós-remix.</li>
        </ul>
      ),
    },
    {
      id: 'triggers',
      icon: Database,
      title: 'Triggers do banco',
      summary: 'Automação de deals e timestamps restaurada.',
      content: (
        <ul className="space-y-2">
          <li><strong>auto_create_deal_on_contact:</strong> todo contato novo ganha um deal no primeiro estágio ativo do pipeline.</li>
          <li><strong>update_conversation_last_message_trigger:</strong> novas mensagens atualizam last_message_at da conversa e last_activity do contato.</li>
          <li><strong>updated_at:</strong> contacts, conversations, conversation_states, message_processing_queue, send_queue, nina_settings e tag_definitions mantêm updated_at atualizado automaticamente.</li>
        </ul>
      ),
    },
    {
      id: 'rls',
      icon: Shield,
      title: 'Políticas RLS single-tenant',
      summary: 'deals e appointments compartilhados entre usuários autenticados.',
      content: (
        <ul className="space-y-2">
          <li>Políticas antigas baseadas em workspace foram substituídas por acesso compartilhado.</li>
          <li>Todos os usuários logados podem ver, criar, editar e excluir deals e appointments — o workspace é único.</li>
        </ul>
      ),
    },
    {
      id: 'polling',
      icon: RefreshCw,
      title: 'Fallback de polling',
      summary: 'Se o Realtime falhar, o Chat ao vivo passa a buscar atualizações a cada 10 segundos.',
      content: (
        <ul className="space-y-2">
          <li>O hook useConversations detecta CHANNEL_ERROR e TIMED_OUT.</li>
          <li>Quando reconecta (SUBSCRIBED), o polling para automaticamente.</li>
          <li>O estado realtimeConnected pode ser usado para indicar visualmente se a conexão está ativa.</li>
        </ul>
      ),
    },
    {
      id: 'verify_jwt',
      icon: Server,
      title: 'verify_jwt = false nas Edge Functions',
      summary: 'Funções chamadas por cron, webhooks e outros serviços não exigem JWT.',
      content: (
        <ul className="space-y-2">
          <li>As funções a seguir devem estar configuradas com <code>verify_jwt = false</code> no <code>supabase/config.toml</code>:</li>
          <li className="font-mono text-xs break-all">
            whatsapp-webhook, message-grouper, nina-orchestrator, whatsapp-sender, initialize-system, validate-setup, simulate-webhook, simulate-audio-webhook, test-whatsapp-message, test-elevenlabs-tts, generate-prompt, analyze-conversation, health-check, seed-appointments, trigger-nina-orchestrator, trigger-whatsapp-sender
          </li>
          <li>Sem isso, cron jobs e webhooks externos recebem 401.</li>
        </ul>
      ),
    },
    {
      id: 'meta-webhook',
      icon: Webhook,
      title: 'Configurar webhook no Meta for Developers',
      summary: 'Aponte a Callback URL da Meta para a Edge Function whatsapp-webhook.',
      content: (
        <ul className="space-y-2">
          <li>Em Configurações → APIs, copie a Callback URL com o <code>whatsapp_webhook_key</code>.</li>
          <li>Cole em Meta for Developers → WhatsApp → Configuration → Callback URL.</li>
          <li>O Verify Token deve coincidir com o <code>whatsapp_verify_token</code> salvo no sistema.</li>
          <li>Após salvar, teste o webhook com o botão "Test" da Meta.</li>
        </ul>
      ),
    },
    {
      id: 'elevenlabs',
      icon: KeyRound,
      title: 'ElevenLabs API key (opcional)',
      summary: 'Só necessária se quiser respostas em áudio.',
      content: (
        <ul className="space-y-2">
          <li>Crie uma chave em elevenlabs.io → Profile → API Keys.</li>
          <li>Cole em Configurações → APIs, seção ElevenLabs.</li>
          <li>Ative <strong>Resposta em áudio</strong> e escolha a voz desejada.</li>
        </ul>
      ),
    },
  ];

  const isDone = (step: StepDef): boolean => {
    if (step.id === 'realtime' || step.id === 'triggers' || step.id === 'rls' || step.id === 'polling') {
      return true;
    }
    return manualDone.includes(step.id);
  };

  const doneCount = steps.filter(isDone).length;
  const progress = Math.round((doneCount / steps.length) * 100);

  return (
    <div className="operation-page help-page">
      <div className="help-container">
        <motion.div
          className="help-header"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
        >
          <p className="via-eyebrow">Checklist pós-remix</p>
          <h1>System Roadmap.</h1>
          <p>
            Tudo o que precisa estar configurado depois de remixar o projeto para o Realtime,
            triggers, RLS e integrações externas funcionarem corretamente.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease }}
          className="help-progress via-tile via-tile--atmos"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-foreground">Implementação pós-remix</p>
            <span className="via-pill border border-border text-muted-foreground">
              {doneCount} de {steps.length} passos
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.8, ease }}
            />
          </div>
          <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              Passos automáticos (Realtime, triggers, RLS e polling) já foram aplicados pelas migrations.
              Os demais dependem de configuração externa e devem ser marcados manualmente ao concluir.
            </span>
          </div>
        </motion.div>

        <div className="mt-6 space-y-3">
          {steps.map((step, idx) => {
            const done = isDone(step);
            const open = openStep === step.id;
            const Icon = step.icon;
            return (
              <motion.div
                key={step.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.12 + idx * 0.06, ease }}
                className={`rounded-2xl border bg-card overflow-hidden transition-colors ${
                  open ? 'border-primary/40' : 'border-border/60 hover:border-border'
                }`}
              >
                <button
                  onClick={() => setOpenStep(open ? null : step.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 text-left"
                >
                  <div
                    className={`relative w-9 h-9 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                      done
                        ? 'bg-primary border-primary text-primary-foreground'
                        : 'border-border bg-background text-muted-foreground'
                    }`}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {done ? (
                        <motion.span
                          key="done"
                          initial={{ scale: 0.4, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.4, opacity: 0 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                        >
                          <Check className="w-4 h-4" />
                        </motion.span>
                      ) : (
                        <motion.span
                          key="num"
                          initial={{ scale: 0.6, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          exit={{ scale: 0.6, opacity: 0 }}
                          className="text-sm font-medium"
                        >
                          {idx + 1}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-primary shrink-0" />
                      <p className={`font-medium truncate ${done ? 'text-muted-foreground' : 'text-foreground'}`}>
                        {step.title}
                      </p>
                      {(step.id === 'realtime' || step.id === 'triggers' || step.id === 'rls' || step.id === 'polling') && (
                        <span className="via-pill border border-primary/30 text-primary hidden sm:inline-flex">automático</span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground truncate mt-0.5">{step.summary}</p>
                  </div>

                  <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease }}
                    >
                      <div className="px-5 pb-5 pl-[4.5rem] text-sm text-muted-foreground leading-relaxed [&_li]:relative [&_li]:pl-4 [&_li:before]:content-[''] [&_li:before]:absolute [&_li:before]:left-0 [&_li:before]:top-[0.55em] [&_li:before]:w-1.5 [&_li:before]:h-1.5 [&_li:before]:rounded-full [&_li:before]:bg-primary/40">
                        {step.content}
                        <div className="mt-4 flex flex-wrap items-center gap-3">
                          {!(step.id === 'realtime' || step.id === 'triggers' || step.id === 'rls' || step.id === 'polling') && (
                            <button
                              onClick={() => toggleManual(step.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            >
                              <Check className="w-3.5 h-3.5" />
                              {manualDone.includes(step.id) ? 'Desmarcar passo' : 'Marcar como concluído'}
                            </button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default SystemRoadmap;
