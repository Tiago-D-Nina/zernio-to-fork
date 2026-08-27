# Varredura da codebase — correções propostas

Resultado da auditoria em duas frentes (frontend `src/**` e edge functions `supabase/functions/**`). A boa notícia: não há divergência de contrato entre serviços do frontend e edge functions (todos os nomes de ação e campos batem), e a lógica compartilhada em `_shared/*` é importada diretamente pelos testes, sem cópias duplicadas que possam dessincronizar.

Abaixo, os problemas reais encontrados, em ordem de risco.

## Prioridade 1 — Risco de perda de mensagem do lead

**1. `message-grouper` marca mensagens como processadas antes de processá-las**
Todas as mensagens prontas são marcadas `processed = true` logo no início. Se qualquer etapa do agrupamento/transcrição falhar, o erro é apenas logado e o grupo é pulado — a mensagem do lead se perde sem nenhuma via de recuperação.
Correção: marcar como processada só após o sucesso do grupo; em caso de falha, reverter a flag (ou registrar tentativa) para o próximo ciclo reprocessar.

**2. Disparo em segundo plano sem `EdgeRuntime.waitUntil`**
O `message-grouper` chama o `nina-orchestrator` com um `fetch` solto. Sem `waitUntil`, o runtime pode encerrar a chamada assim que a resposta HTTP retorna, atrasando a resposta da Nina até a próxima varredura do cron. O padrão correto já é usado no `whatsapp-webhook` e em outro trecho do próprio `message-grouper`.
Correção: envolver o disparo em `EdgeRuntime.waitUntil`, igual ao padrão existente.

## Prioridade 2 — Autorização inconsistente

**3. `message-grouper` e `whatsapp-sender` aceitam qualquer usuário logado**
Ambos varrem a fila global da plataforma, mas usam `requireAuth` (aceita service-role **ou** qualquer JWT de usuário), enquanto o `nina-orchestrator`, equivalente em poder, exige `requireServiceRole`. Hoje qualquer usuário autenticado pode forçar o processamento/envio da fila inteira ou martelar o loop de varredura (até 25s por chamada no sender).
Correção: alinhar ao `nina-orchestrator` (`requireServiceRole`). Se houver necessidade de disparo manual pela UI, expor isso como ação separada restrita a admin.

## Prioridade 3 — Robustez do frontend

**4. Corrida no Dashboard ao trocar de período** (`src/components/Dashboard.tsx`)
Trocas rápidas de período podem fazer uma resposta antiga sobrescrever a nova, exibindo métricas erradas. Correção: guarda de cancelamento (flag `ignore` no cleanup do efeito).

**5. Promises sem `.catch`**
- `src/lib/mediaProxy.ts` — `getSession().then(...)` no topo do módulo, sem catch: rejeição vira unhandled rejection.
- `src/components/Help.tsx` — duas queries sem catch: falham em silêncio, sem log nem feedback.
Correção: adicionar tratamento de erro com fallback explícito.

## Prioridade 4 — Limpeza (código morto)

**Edge functions inalcançáveis:** `trigger-nina-orchestrator` e `trigger-whatsapp-sender`. Os cron jobs chamam `nina-orchestrator` e `whatsapp-sender` diretamente; as únicas referências restantes estão em `CHAT_SYSTEM_SQL_SCRIPTS.sql`, um script avulso não aplicado. Proposta: remover as duas funções e as referências no script — **confirme antes** se nenhum script de operação externo aponta para elas.

**Exports não utilizados:** `generateAgentSetupProposal` (`agent-setup.ts`), `runScore`/`BEHAVIOR_HINTS`/`CATEGORY_LABELS` (`evals.ts`), `getProvider`/`legacyModeToModel`/`TIER_LABELS` (`llmCatalog.ts`), `useIsMobile` (`use-mobile.tsx`). Proposta: remover.

## Notas técnicas

- Nenhum `TODO`, stub ou handler noop encontrado nos componentes.
- Nenhuma migration nova é necessária; as correções são todas em código.
- As edge functions alteradas (`message-grouper`, `whatsapp-sender`) precisarão de novo deploy.
- Testes: adicionar cobertura para o caminho de falha do `message-grouper` (mensagem não pode ficar marcada como processada) antes da correção, seguindo o ciclo red-green-refactor.
