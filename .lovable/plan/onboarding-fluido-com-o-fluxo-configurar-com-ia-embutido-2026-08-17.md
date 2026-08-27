# Onboarding fluido com o fluxo "Configurar com IA" embutido

O assistente "Configurar com IA" (Configurações → Agente) tem uma experiência melhor que o passo "Agente" do onboarding, que hoje é uma lista de campos manuais e um botão que **fecha o wizard**, dispensa o onboarding e navega para outra tela. O plano mantém os quatro passos e a conexão de canal onde está, e troca o miolo do passo "Agente" pelo próprio assistente com IA, rodando dentro do wizard.

## Como fica o fluxo

```text
1. Seu negócio    nome da empresa + nome da agente          (como hoje)
2. Canais         Zernio ou WhatsApp Cloud API              (como hoje, com "Pular")
3. Agente         assistente com IA embutido:
                  Negócio -> Atendimento -> Materiais -> Revisão da proposta
4. Revisão        checklist final + concluir
```

Nada de modal dentro de modal, nada de sair do wizard no meio, nada de dispensar o onboarding para configurar a agente.

## Mudanças

### 1. Assistente reutilizável em duas roupagens
`AgentSetupAssistant` hoje é um `Dialog` com cabeçalho, stepper interno, corpo e rodapé próprios. Extrair todo o miolo (estado, geração em streaming, revisão, aplicação, persistência em `sessionStorage`) para um componente único que aceita uma variante de apresentação:

- `variant="dialog"` — comportamento atual em Configurações → Agente, sem nenhuma mudança visível.
- `variant="embedded"` — sem `Dialog`, sem cabeçalho próprio, sem botão fechar; renderiza direto no corpo do wizard e delega os botões Voltar/Avançar ao rodapé do onboarding.

Toda a lógica continua compartilhada: uma sessão iniciada no onboarding e retomada em Configurações (ou o contrário) segue do mesmo ponto, porque a chave de `sessionStorage` continua por agente.

### 2. Passo "Agente" do onboarding
- Substituir a lista de campos editáveis pelo assistente embutido.
- Pré-preencher as respostas do assistente com o que a pessoa digitou nos passos 1 e 2 (nome da empresa, nome da agente) e com o rascunho atual do agente.
- O rodapé do wizard passa a comandar o sub-passo do assistente: "Avançar" caminha dentro dele (Negócio → Atendimento → Materiais → Revisão) e só passa ao passo 4 do onboarding depois que a proposta for aplicada — ou quando a pessoa escolher "Fazer à mão depois".
- Manter uma saída explícita: um link discreto para preencher campo a campo em Configurações → Agente, sem dispensar o onboarding.
- Remover a navegação atual (`navigate('/settings?tab=agent&setup=1')` + `dismiss()`) do wizard. O deep-link `?setup=1` continua funcionando em Configurações.

### 3. Continuidade e fluidez
- Barra de progresso e stepper do wizard passam a refletir também o sub-passo do assistente, para não parecer que o passo 3 "trava".
- Identidade digitada nos passos 1 e 3 continua sendo gravada ao avançar, com a mesma regra de campos sujos (`dirtyIdentityRef`) que evita sobrescrever edição concorrente.
- O passo 4 (Revisão) reaproveita o checklist de `useOnboardingStatus`, que já marca "Agente" como completo quando a identidade estruturada existe — aplicar a proposta preenche exatamente esses campos.
- Diálogo maior no onboarding (o assistente precisa de espaço) e rolagem interna só no corpo.

## Detalhes técnicos

- `src/components/settings/AgentSetupAssistant.tsx`: extrair o corpo para `AgentSetupFlow` (mesmo arquivo ou `AgentSetupFlow.tsx`), expor `variant`, e opcionalmente `onStepChange`/`stepController` para o rodapé externo comandar avançar/voltar. O export default atual permanece como wrapper de `Dialog` para não mexer em `AgentWorkspaceSettings`.
- `src/components/OnboardingWizard.tsx`: `renderStepCerebro` passa a montar `AgentSetupFlow` embutido, alimentado por `getCurrentAgentContext()` (`agentId`, `draftConfig`, `draftRevision`) já usado ali; `onApply` grava o rascunho pelo mesmo caminho de hoje e dispara `notifyOnboardingChange()`.
- Estado do assistente continua em `sessionStorage` por `agentId` — abrir/fechar o wizard não perde progresso.
- Sem migrations, sem mudança em edge functions, sem alteração no passo de Canais (Zernio/Cloud API ficam exatamente como estão).
- Testes: os testes existentes de `agent-setup`/`setupQuestions` cobrem a lógica extraída e devem continuar verdes; a extração é refactor sem mudança de comportamento no modo dialog.
