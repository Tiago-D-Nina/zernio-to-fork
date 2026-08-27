# Integração CliniCorp × Nina

## Resposta curta: sim, o CliniCorp tem API aberta

O CliniCorp expõe uma API REST pública e documentada:

- Base: `https://api.clinicorp.com/rest/v1`
- Documentação: `https://sistema.clinicorp.com/api-docs/`
- Autenticação: HTTP Basic com **Usuário API + Token API**, gerados dentro do próprio CliniCorp em *Gerenciar Assinatura > Acesso Externo e Integrações*. Também é exigido o **Subscriber ID** (em geral igual ao usuário API) e, para algumas rotas, o **ID da clínica**, obtido com o suporte.
- Não há OAuth nem, pelo que a documentação pública mostra, webhooks de entrada. A integração é **pull** (a Nina consulta e escreve; não recebe eventos). Isso significa que mudanças feitas dentro do CliniCorp só chegam à Nina quando ela consultar.

Recursos relevantes para a Nina: Paciente (criar, buscar, aniversários, listar agendamentos), Agendamento (dias disponíveis, horários disponíveis, criar, criar agendamento online, confirmar, alterar status, cancelar, listar), Clínica (horários disponíveis, cadeiras, unidades), Profissional, Procedimento e especialidades, CRM (cadastrar lead, campanhas ativas), Financeiro e **Orçamentos**.

Sobre orçamentos, a API oferece: buscar um orçamento específico, listar orçamentos (com filtro por período/paciente), totais de orçamento por paciente e o relatório de orçamentos versus conversão em vendas. É leitura — a API pública não expõe criação de orçamento, então a Nina consulta e comenta orçamentos existentes, mas quem monta o orçamento continua sendo a clínica.

Ponto de atenção conhecido: o `crm/add_leads` apenas cadastra no board, não move etapas nem checa duplicidade — a deduplicação precisa ficar do nosso lado.

## O que proponho construir

Um conector CliniCorp equivalente ao que já existe para o Nylas: credenciais guardadas no backend, uma Edge Function como única porta de saída e novas ferramentas do agente, governadas pela política de ações publicada.

### 1. Credenciais e configuração
- Nova tabela `clinicorp_credentials` por workspace: usuário API, token API, subscriber id, clinic id, flag de ativo. RLS habilitada, GRANTs explícitos, token gravado write-only (a UI mostra máscara e permite sobrescrever, nunca ler).
- Tela em **Configurações > Integrações > CliniCorp**, no mesmo padrão do painel do Nylas: campos, botão "Testar conexão" (valida chamando a listagem de profissionais) e instruções de onde gerar o token.

### 2. Edge Function `clinicorp` (porta única)
- Um cliente tipado `ClinicorpClient` em `supabase/functions/_shared/clinicorp.ts`, com métodos por recurso, timeout, tratamento de erro e nenhum `fetch` solto no restante do código.
- Ações expostas: `test_connection`, `list_professionals`, `list_procedures`, `available_days`, `available_times`, `find_or_create_patient`, `create_appointment`, `confirm_appointment`, `cancel_appointment`, `list_patient_appointments`, `add_lead`, `get_estimate`, `list_estimates`, `patient_estimate_totals`.
- Validação de entrada com Zod, JWT validado em código com o helper `getUserFromToken` já existente.

### 3. Ferramentas da Nina
Novas tools registradas em `nina-orchestrator`, ativadas apenas quando a integração está configurada **e** a ação está liberada na versão publicada da agente:

- `clinicorp_horarios_disponiveis` — consulta dias/horários reais da clínica antes de oferecer qualquer data.
- `clinicorp_agendar_consulta` — cria (ou reutiliza) o paciente e grava o agendamento no CliniCorp.
- `clinicorp_cancelar_consulta` e `clinicorp_reagendar_consulta`.
- `clinicorp_registrar_lead` — envia o lead para o CRM do CliniCorp, com guarda de duplicidade nossa.
- `clinicorp_consultar_orcamento` — busca os orçamentos do paciente identificado pelo telefone da conversa e devolve status, procedimentos, valores e validade, para a Nina responder "quanto ficou" e retomar orçamento parado.

Todas passam pelo mesmo pipeline já existente: confirmação explícita do lead, `runAuditedAction` com registro em `agent_action_runs`, rate limit e redação de dados sensíveis. A consulta de orçamento é leitura, mas exige que o paciente já esteja vinculado ao contato — sem match confiável por telefone/documento a tool recusa, para nunca revelar valores de outra pessoa.

### 4. Agenda: quem é a fonte da verdade
Hoje o agendamento nasce na tabela `appointments` e é espelhado no Nylas. Com o CliniCorp, a disponibilidade e a agenda da clínica passam a ser a autoridade quando a integração estiver ativa: a Nina consulta o CliniCorp para oferecer horários, cria lá, e replica localmente em `appointments` com o id externo em `metadata` para exibição no app. Nylas continua funcionando para quem não usa CliniCorp.

### 5. Sincronização de volta
Como não há webhook, um job periódico (cron) reconcilia os agendamentos do dia e dos próximos dias, atualizando status local a partir do CliniCorp (confirmado, cancelado, faltou). Intervalo sugerido: 10 minutos.

## Detalhes técnicos

- Novo shared: `supabase/functions/_shared/clinicorp.ts` (client injetável, testável com fake).
- Nova função: `supabase/functions/clinicorp/index.ts`.
- Novo serviço frontend: `src/services/clinicorp.ts` e painel `src/components/settings/ClinicorpSettings.tsx`.
- Migration versionada criando a tabela de credenciais, com `GRANT` para `authenticated`/`service_role` e políticas single-tenant no padrão do projeto.
- Testes: unitários do client contra um fake HTTP (mapeamento de payload, erros, autenticação), testes das novas tools no orquestrador com fake do client, teste SQL de RLS da nova tabela.

## O que preciso saber antes de codar

1. Você já tem uma conta CliniCorp com Usuário API, Token API e ID da clínica para testarmos de verdade, ou a integração deve ser construída "às cegas" contra a documentação?
2. Qual a ordem de prioridade entre **agendamento de consultas**, **consulta de orçamentos** e **CRM/lead**?
3. A Nina pode falar valores de orçamento diretamente no WhatsApp, ou deve apenas avisar que existe um orçamento e encaminhar para a clínica?
