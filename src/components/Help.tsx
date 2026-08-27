import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LifeBuoy, CreditCard, KeyRound, Link2, MessageCircle, RefreshCw,
  GraduationCap, ChevronDown, ExternalLink, Check, ArrowRight, Plug
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { channelsApi, ZernioStatus } from '@/services/channels';
import { supabase } from '@/integrations/supabase/client';

// Passos marcados à mão (os que o sistema não consegue detectar sozinho)
const MANUAL_STEPS_KEY = 'nina_help_manual_steps';

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
  auto: boolean;
  content: React.ReactNode;
  action?: { label: string; to?: string; href?: string };
}

const ease = [0.22, 1, 0.36, 1] as const;

const Help: React.FC = () => {
  const navigate = useNavigate();
  const [openStep, setOpenStep] = useState<string | null>(null);
  const [manualDone, setManualDone] = useState<string[]>(loadManualSteps);
  const [status, setStatus] = useState<ZernioStatus | null>(null);
  const [hasConversations, setHasConversations] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [hasCloudApi, setHasCloudApi] = useState(false);
  const [altOpen, setAltOpen] = useState(false);

  useEffect(() => {
    // Status real da integração: marca os passos 3-5 sozinho.
    // Membros sem papel admin recebem 403 aqui — o guia segue sem os selos.
    channelsApi.status().then(setStatus).catch(() => setStatus(null));
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .then(({ count, error }) => {
        if (error) {
          console.error('[Help] Falha ao contar conversas:', error);
          return;
        }
        setHasConversations((count ?? 0) > 0);
      });
    // Caminho alternativo (Cloud API própria): a view pública expõe só a flag,
    // então o selo funciona para qualquer usuário logado
    supabase
      .from('nina_settings_public')
      .select('has_whatsapp_cloud')
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) {
          console.error('[Help] Falha ao ler o status do WhatsApp Cloud:', error);
          return;
        }
        setHasCloudApi(!!data?.has_whatsapp_cloud);
      });
  }, []);

  const whatsappActive = !!status?.connections.some(
    (c) => c.platform === 'whatsapp' && c.status === 'active'
  );

  const toggleManual = (id: string) => {
    setManualDone((prev) => {
      const next = prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id];
      localStorage.setItem(MANUAL_STEPS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const steps: StepDef[] = useMemo(() => [
    {
      id: 'conta',
      icon: CreditCard,
      title: 'Criar a conta na Zernio no plano usage-based',
      summary: 'O WhatsApp e o Inbox só existem nesse plano — e as 2 primeiras contas são grátis.',
      auto: false,
      content: (
        <ul className="space-y-2">
          <li>Crie a conta em zernio.com. O WhatsApp (inclusive por coexistência) e o Inbox só existem no plano usage-based.</li>
          <li>As 2 primeiras contas conectadas são grátis para sempre, já com Inbox, templates e broadcasts inclusos.</li>
          <li>Da 3ª conta em diante: USD 6 por conta/mês — cai para USD 3 acima de 10 contas e USD 1 acima de 100.</li>
          <li>Conta já existente em outro plano? Em zernio.com/dashboard/billing, use "Switch to usage-based pricing".</li>
        </ul>
      ),
      action: { label: 'Abrir zernio.com', href: 'https://zernio.com/dashboard/billing' },
    },
    {
      id: 'chave',
      icon: KeyRound,
      title: 'Gerar a chave da API',
      summary: 'Settings → API Keys na Zernio. A chave aparece uma única vez.',
      auto: false,
      content: (
        <ul className="space-y-2">
          <li>Na Zernio, vá em Settings → API Keys e crie uma chave nova.</li>
          <li>Ela começa com sk_ e é exibida uma única vez — copie na hora.</li>
          <li>Trate a chave como uma senha: quem a tiver controla seus canais.</li>
        </ul>
      ),
    },
    {
      id: 'conectar-chave',
      icon: Link2,
      title: 'Conectar a chave ao sistema',
      summary: 'Cole a chave em Configurações → APIs e salve.',
      auto: true,
      content: (
        <ul className="space-y-2">
          <li>Aqui no sistema, abra Configurações → APIs, seção Zernio API (ou use o assistente inicial).</li>
          <li>Cole a chave e salve: o sistema valida na Zernio e cria o perfil que agrupa suas contas.</li>
          <li>Este passo se marca sozinho quando a chave estiver salva e validada.</li>
        </ul>
      ),
      action: { label: 'Ir para Configurações', to: '/settings?tab=apis' },
    },
    {
      id: 'whatsapp',
      icon: MessageCircle,
      title: 'Conectar o WhatsApp por coexistência',
      summary: 'O mesmo número continua no celular e passa a responder por aqui também.',
      auto: true,
      content: (
        <ul className="space-y-2">
          <li>Clique em "Conectar WhatsApp": uma aba da Meta abre com a autorização oficial.</li>
          <li>Escolha conectar a conta existente do app WhatsApp Business e escaneie o QR code com o celular.</li>
          <li>O número continua funcionando normalmente no aplicativo — a coexistência é exatamente isso.</li>
          <li>Requisitos: conta Meta Business e app WhatsApp Business atualizado (2.24.17 ou mais novo).</li>
          <li>Até 6 meses de conversas são sincronizados; grupos e mensagens temporárias não passam pela API.</li>
        </ul>
      ),
      action: { label: 'Ir para Configurações', to: '/settings?tab=channels' },
    },
    {
      id: 'sincronizar',
      icon: RefreshCw,
      title: 'Sincronizar e fazer o primeiro teste',
      summary: 'Clique em Sincronizar, mande uma mensagem de teste e veja a conversa no Chat ao vivo.',
      auto: true,
      content: (
        <ul className="space-y-2">
          <li>De volta ao sistema, clique em "Sincronizar" — a conta aparece como Ativa.</li>
          <li>Peça para alguém mandar uma mensagem ao seu número e acompanhe a mensagem chegando no Chat ao vivo.</li>
          <li>Se você responder pelo próprio app do WhatsApp, a Nina pausa naquela conversa e o atendimento vira humano — dá para devolver para ela no Chat ao vivo.</li>
        </ul>
      ),
      action: { label: 'Abrir o Chat ao vivo', to: '/chat' },
    },
    {
      id: 'treinar',
      icon: GraduationCap,
      title: 'Preparar a agente antes de publicar',
      summary: 'Configure, revise situações importantes e publique somente quando estiver seguro.',
      auto: false,
      content: (
        <ul className="space-y-2">
          <li>Em Configurações → Agente → Conhecimento, cadastre informações confirmadas e envie seus documentos.</li>
          <li>Em Configurações → Agente → Testar e publicar, execute as situações de teste geradas pelas suas próprias regras.</li>
          <li>Corrija erros críticos. Alertas podem ser revisados e aceitos conscientemente por quem tem permissão.</li>
        </ul>
      ),
      action: { label: 'Gerenciar conhecimento', to: '/settings?section=knowledge' },
    },
  ], []);

  const isDone = (step: StepDef): boolean => {
    if (step.id === 'conectar-chave') return !!status?.hasKey || manualDone.includes(step.id);
    if (step.id === 'whatsapp') return whatsappActive || manualDone.includes(step.id);
    if (step.id === 'sincronizar') return (whatsappActive && hasConversations) || manualDone.includes(step.id);
    return manualDone.includes(step.id);
  };

  const doneCount = steps.filter(isDone).length;
  const progress = Math.round((doneCount / steps.length) * 100);

  const faqs = [
    {
      q: 'Quanto custa a Zernio?',
      a: 'As 2 primeiras contas conectadas são grátis para sempre, com WhatsApp, Inbox, templates e broadcasts inclusos. Da 3ª conta em diante: USD 6 por conta/mês até 10 contas, USD 3 de 11 a 100 e USD 1 acima disso. Número conectado por coexistência não paga taxa extra por número.',
    },
    {
      q: 'Preciso usar a Zernio?',
      a: 'Não. O sistema também funciona conectado direto na API oficial da Meta, com token próprio — o passo a passo está no card "Caminho alternativo", logo acima. A diferença prática é que esse caminho não tem coexistência: o número fica dedicado à API e a cobrança por conversa vem direto da Meta. A Zernio é recomendada quando você quer manter o mesmo número no WhatsApp Business.',
    },
    {
      q: 'Vou perder o WhatsApp do celular?',
      a: 'Não. A coexistência mantém o mesmo número funcionando no app WhatsApp Business e aqui na plataforma ao mesmo tempo. Para desconectar, o caminho é no próprio app: Configurações → Conta → Plataforma comercial.',
    },
    {
      q: 'A Nina responde tudo sozinha?',
      a: 'Conversas em modo Nina, sim. Quando você responde pelo app do celular ou pela plataforma, aquela conversa passa para o modo humano e a Nina pausa — no Chat ao vivo dá para devolver a conversa para ela.',
    },
    {
      q: 'Por que algumas mensagens exigem template?',
      a: 'Regra da Meta: mensagem livre só até 24 horas depois da última mensagem do cliente. Fora dessa janela, apenas templates aprovados podem ser enviados. Você cria e acompanha a aprovação dos seus templates em Configurações → Canais.',
    },
  ];

  return (
    <div className="operation-page help-page">
      <div className="help-container">
        {/* Header */}
        <motion.div
          className="help-header"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease }}
        >
          <p className="via-eyebrow">Suporte à operação</p>
          <h1>Central de ajuda.</h1>
          <p>
            O caminho completo para colocar a Nina no ar com a Zernio — do plano certo à primeira conversa respondida.
            Prefere não passar pela Zernio? O caminho alternativo pela API oficial da Meta está logo abaixo dos passos.
          </p>
        </motion.div>

        {/* Progresso */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08, ease }}
          className="help-progress via-tile via-tile--atmos"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-medium text-foreground">Implementação com a Zernio</p>
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
          <p className="mt-3 text-xs text-muted-foreground">
            Os passos com selo "automático" se marcam sozinhos conforme a configuração avança. Os demais você marca ao concluir.
          </p>
        </motion.div>

        {/* Passos */}
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
                  {/* Indicador do passo */}
                  {/* A cor do texto vive aqui, não no número: quando o passo
                      é concluído o círculo muda na hora, mas o número ainda
                      leva a animação de saída pra sumir. Herdando a cor, ele
                      sai legível em vez de piscar sobre o fundo novo. */}
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
                      {step.auto && (
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
                          {step.action && (
                            step.action.to ? (
                              <button
                                onClick={() => navigate(step.action!.to!)}
                                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                              >
                                {step.action.label}
                                <ArrowRight className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <a
                                href={step.action.href}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                              >
                                {step.action.label}
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )
                          )}
                          {!step.auto && (
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

        {/* Caminho alternativo: Cloud API própria, sem Zernio */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.5, ease }}
          className={`mt-6 rounded-2xl border bg-card overflow-hidden transition-colors ${
            altOpen ? 'border-primary/40' : 'border-border/60 hover:border-border'
          }`}
        >
          <button
            onClick={() => setAltOpen(!altOpen)}
            className="w-full flex items-center gap-4 px-5 py-4 text-left"
          >
            <div className="w-9 h-9 rounded-full border border-border bg-background flex items-center justify-center shrink-0">
              <Plug className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-foreground truncate">
                  Caminho alternativo: API oficial da Meta, com token próprio
                </p>
                {hasCloudApi && (
                  <span className="via-pill border border-primary/30 text-primary hidden sm:inline-flex">configurado</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate mt-0.5">
                Para quem prefere a própria conta na WhatsApp Cloud API, sem passar pela Zernio.
              </p>
            </div>
            <motion.span animate={{ rotate: altOpen ? 180 : 0 }} transition={{ duration: 0.25 }}>
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {altOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease }}
              >
                <div className="px-5 pb-5 pl-[4.5rem] text-sm text-muted-foreground leading-relaxed space-y-4">
                  <p>
                    O sistema também conversa direto com a Cloud API da Meta. Antes de escolher, saiba as diferenças:
                    esse caminho não tem coexistência (o número fica dedicado à API e sai do app do celular), e a
                    cobrança por conversa vem direto da Meta — sem mensalidade da Zernio.
                  </p>
                  <ol className="space-y-2 list-decimal pl-4 marker:text-primary/60 marker:font-medium">
                    <li>
                      No <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">Meta for Developers</a>,
                      crie um app do tipo Business e adicione o produto WhatsApp. Para produção, cadastre um número que
                      possa ficar exclusivo da API.
                    </li>
                    <li>
                      Em API Setup, copie o Access Token, o WABA ID e o Phone Number ID. O token de teste vence em
                      24 horas — para valer, gere um token permanente com um System User no Business Manager.
                    </li>
                    <li>
                      Aqui no sistema, abra Configurações, aba APIs, seção WhatsApp Cloud API: cole o token, o
                      WABA ID e o Phone Number ID e salve.
                    </li>
                    <li>
                      Na mesma tela, abra "Configuração de Webhook" e copie a Callback URL e o Verify Token.
                      Na Meta, em WhatsApp → Configuration → Webhook, cole os dois e assine o campo "messages".
                    </li>
                    <li>
                      Valide com o "Teste de Envio" da própria aba e peça uma mensagem de volta — a conversa
                      aparece no Chat ao vivo e a Nina responde por ali.
                    </li>
                  </ol>
                  <p>
                    Esse processo inteiro está documentado de ponta a ponta na formação WhatsApp API, disponível na{' '}
                    <a href="https://app.viverdeia.ai/formacoes/formacao-de-whatsapp-api" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
                      plataforma da Viver de IA
                    </a>
                    {' '}— vale acompanhar por lá na primeira configuração.
                  </p>
                  <p>
                    Feito isso, o restante do guia vale igual: configuração, revisão, testes e publicação são os mesmos nos dois caminhos.
                  </p>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => navigate('/settings?tab=apis')}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                    >
                      Abrir a aba APIs
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                    >
                      Abrir a documentação da Meta
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* FAQ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.62, ease }}
          className="mt-10"
        >
          <h2 className="text-lg font-semibold tracking-tight text-foreground mb-4">Perguntas frequentes</h2>
          <div className="rounded-2xl border border-border/60 bg-card divide-y divide-border/60">
            {faqs.map((faq, i) => (
              <div key={i}>
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="text-sm font-medium text-foreground">{faq.q}</span>
                  <motion.span animate={{ rotate: openFaq === i ? 180 : 0 }} transition={{ duration: 0.25 }}>
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {openFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease }}
                    >
                      <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">{faq.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </motion.div>

        <p className="mt-8 mb-4 text-xs text-muted-foreground text-center">
          Travou em algum passo? Questões de plano, conta ou conexão se resolvem no{' '}
          <a href="https://zernio.com" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
            suporte da Zernio
          </a>
          {' '}— ou no{' '}
          <a href="https://developers.facebook.com/support" target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground transition-colors">
            suporte da Meta
          </a>
          , se você foi pela API oficial; dúvidas sobre o sistema, com quem implantou para você.
        </p>
      </div>
    </div>
  );
};

export default Help;
