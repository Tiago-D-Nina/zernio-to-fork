# Nina · SDR com IA

Agente de SDR conversacional para **WhatsApp**. A Nina qualifica leads, agenda reuniões, move deals no pipeline e responde com base no conhecimento do negócio — sem inventar informação.

## Stack

- **Front**: Vite + React 18 + TypeScript + Tailwind (design system Viver de IA — tokens em `src/index.css`, guia em `docs/design-tokens.md`)
- **Backend**: Supabase (Lovable Cloud) — Postgres + RLS + Edge Functions (Deno)
- **IA**: Lovable AI Gateway (Gemini) com loop de ferramentas real (`supabase/functions/_shared/nina-engine.ts`)
- **Canais**: Meta WhatsApp Cloud API (direta) e **Zernio API** (WhatsApp por coexistência) — referência em `docs/zernio-api.md`
- **Agenda**: Google Calendar via OAuth 2.0, com criação, edição, reagendamento e cancelamento — referência em `docs/google-calendar.md`

## Como a agente reduz invenções

1. **Fatos canônicos** (`knowledge_facts`): verdades verbatim (preço, link, horário) injetadas em todo prompt.
2. **Base de conhecimento** (`knowledge_documents` → chunks): busca híbrida full-text (português) + trigram exposta como ferramenta `buscar_conhecimento` — a Nina consulta antes de responder qualquer pergunta factual.
3. **Regras de verdade** no prompt: sem informação encontrada → não inventa; registra em `unanswered_questions` (`registrar_duvida`) e diz que vai confirmar.
4. **Simulação segura**: o rascunho pode ser conversado e avaliado sem executar ações reais.
5. **Situações de teste**: regras críticas, ações, handoff e opt-out geram testes automáticos; o operador também cria cenários próprios.
6. **Publicação governada**: erros críticos, instabilidade e falhas técnicas bloqueiam; alertas exigem aceite consciente.

## Fluxo de mensagens

```
WhatsApp Cloud:  Meta → whatsapp-webhook → message_grouping_queue → message-grouper ┐
Zernio (coex/IG): Zernio → zernio-webhook (HMAC + dedup + debounce) ────────────────┼→ nina_processing_queue
                                                                                    ┘
nina-orchestrator (nina-engine: fatos + busca + tools) → send_queue → whatsapp-sender
                                                       (roteia Meta Cloud ou Zernio API por conversa)
```

## Configuração

1. **Zernio**: Configurações → APIs → salvar a API key (`sk_…` de zernio.com → Settings → API Keys) → Canais → Conectar WhatsApp (coexistência: o app continua funcionando) → Sincronizar contas. O webhook é registrado automaticamente.
2. **Cloud API manual** (alternativa): Configurações → APIs.
3. **Agente**: Configurações → Agente centraliza identidade, vendas, conhecimento, ações, situações de teste, publicação e histórico. Toda edição é autosalva no rascunho; a versão ativa continua atendendo.
4. **Google Calendar**: Configurações → Agenda → Conectar Google Calendar. O setup do OAuth e os secrets necessários estão em `docs/google-calendar.md`.
5. Secrets necessários no Supabase: `LOVABLE_API_KEY` (gateway de IA), `GOOGLE_CALENDAR_CLIENT_ID` e `GOOGLE_CALENDAR_CLIENT_SECRET`. Credenciais de canal ficam em `nina_settings`.

## Configuração e publicação governadas

Configurações → Agente trabalha com uma configuração estruturada e compila o prompt
como artefato somente leitura. A avaliação `nina-eval` usa um snapshot do rascunho,
simula ferramentas, repete cenários críticos e classifica cada resultado. Uma publicação
só aceita uma rodada concluída da mesma revisão do rascunho. Cada publicação cria uma
versão imutável, e versões anteriores podem ser restauradas em um novo rascunho.

O aprendizado assistido analisa conversas somente quando solicitado, remove identificadores
comuns da evidência e salva sugestões pendentes. Nenhuma sugestão altera fatos, rascunho
ou produção sem revisão humana.

Detalhes de arquitetura, deploy e validação estão em `docs/agent-configuration.md`.

## Desenvolvimento

```sh
bun install
bun dev        # http://localhost:8080
bun run build
```

Deploy: push na `main` → sync automático do Lovable (migrations e edge functions incluídas).

## Remix / novo projeto Supabase

O projeto se auto-configura: as edge functions replicam `SUPABASE_URL` e a service role key do próprio ambiente para o Vault (RPC `ensure_edge_secrets`, chamada no primeiro signup e a cada execução do orchestrator), e os cron jobs de varredura leem de lá — nada de URL ou chave hardcoded. Basta remixar, criar a primeira conta (vira admin) e os sweeps se ativam sozinhos.
