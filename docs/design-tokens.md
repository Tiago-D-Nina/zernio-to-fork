# Design system Viver de IA — guia de implementação

Os arquivos `src/styles/via-tokens.css`, `via-surfaces.css` e `via-data.css`
são cópias literais do repositório oficial e não devem receber adaptações
locais. A ponte para Tailwind/shadcn vive em `src/index.css`; o acabamento
dos primitives do produto vive em `src/styles/via-primitives.css`.

O app usa tokens semânticos (shadcn) definidos em `src/index.css` com a paleta Viver de IA (navy `#0A1F3B` dominante, claro + escuro). **Nunca** usar classes de cor hardcoded do Tailwind (`slate-*`, `cyan-*`, `teal-*`, `violet-*`, `purple-*`, `gray-*`, `zinc-*`, hex literais). Cores banidas pela marca em qualquer nível: gold/amarelo/amber, cyan, roxo, magenta, neon.

## Tabela de conversão

| Hardcoded (antigo) | Token (novo) |
|---|---|
| `bg-slate-950`, `bg-slate-900` (fundo de página) | `bg-background` |
| `bg-slate-900/50`, `bg-slate-900` (cards) | `bg-card` (glass: `bg-card/50`) |
| `bg-slate-800`, `bg-slate-800/50` (superfície elevada) | `bg-secondary` ou `bg-muted` |
| `hover:bg-slate-800`, `hover:bg-slate-700` | `hover:bg-accent` |
| `border-slate-800`, `border-slate-700` | `border-border` (ou só `border`) |
| `text-white`, `text-slate-50/100/200` | `text-foreground` |
| `text-slate-300/400/500` | `text-muted-foreground` |
| `text-cyan-400`, `text-cyan-300` (acento/link/ícone ativo) | `text-primary` |
| `bg-cyan-500/600`, `bg-cyan-500/10` | `bg-primary`, `bg-primary/10` |
| `border-cyan-500/20` | `border-primary/20` |
| `ring-cyan-500`, `focus:ring-cyan-*` | `ring-ring` |
| gradiente `from-cyan-600 to-teal-600` (CTA) | `bg-primary` sólido (sem gradiente quente/neon) |
| glow `shadow-[0_0_15px_rgba(6,182,212,*)]` | remover (usar `shadow-sm`) |
| `text-red-*`, `bg-red-*` (erro/destrutivo) | `text-destructive`, `bg-destructive/10`, `border-destructive/20` |
| `text-emerald/green-*`, `bg-emerald-*` (sucesso/online) | `text-success`, `bg-success/10`, `border-success/20` |
| `violet/purple-*` (qualquer uso) | `primary` (banido roxo) |
| `orange/amber/yellow-*` (avisos) | `text-muted-foreground` + ícone, ou `destructive` se erro real |
| Hex em recharts (`#06b6d4`, `#1e293b`, `#64748b`, `#0f172a`) | `hsl(var(--chart-1))` … `hsl(var(--chart-5))`, grid `hsl(var(--border))`, texto `hsl(var(--muted-foreground))` |
| `bg-gradient-to-* from-primary to-accent` (logo/avatar) | `bg-primary` sólido |

## Regras Viver de IA

- Badges/chips de status: usar `<Badge>` de `@/components/ui/badge` (variants: `secondary`, `muted`, `outline`, `destructive`, `success`, `default`) ou `.via-meta-chip` — discreto, sem CAPS LOCK e sem bolinha decorativa.
- Verde só para presença/sucesso real; coral (`destructive`) só para destrutivo/erro real. Sem semáforo em chips genéricos.
- Não usar barra lateral/superior colorida como recurso de ênfase. Hierarquia vem de espaço, peso, superfície e ícone.
- O produto é `light-first`: ausência de preferência salva deve resolver para `light`; `dark` é uma opção explícita e usa os mesmos tokens sem variantes locais.
- Em navegação e chrome de marca, prefira o lockup completo “Viver de IA”; o monograma fica reservado a espaços realmente compactos.
- Liquid glass exige a receita completa: superfície translúcida, blur, hairline uniforme, linha de luz e sombra navy. Não aplicar vidro em tabelas densas.
- CTAs em sentence-case ("Salvar alterações", não "SALVAR").
- Sem emoji decorativo em UI (✨🚀🔥); ícones lucide ok. Ícone `Sparkles` é banido — substituir por `Compass`, `Layers`, `MessageCircle`, `Award` conforme contexto.
- Inputs: usar `<Input>` de `@/components/ui/input` em vez de `<input>` estilizado à mão quando a troca for direta; senão, ao menos trocar as cores por tokens (`bg-secondary/50 border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-ring`).
- Botões: `Button` de `@/components/Button` (API legada primary/secondary/outline/ghost/danger) já é token-based — não estilizar por cima com cores.
- Scroll: classe `custom-scrollbar` agora existe e funciona.
- Dialog, AlertDialog, Sheet, Card, Tabs, Select, Textarea e Popover já recebem o acabamento oficial pelos primitives compartilhados. Não recriar overlays e painéis manualmente quando esses componentes servirem.
- Para páginas operacionais, reutilizar `.operation-page`, `.operation-container`, `.operation-header`, `.operation-toolbar`, `.operation-search` e as classes `.via-table*`/`.via-metric*`.

## O que NÃO fazer

- Não mudar lógica, handlers, queries ou estrutura de dados — só apresentação.
- Não introduzir novas dependências.
- Não usar `dark:` variants — os tokens já resolvem claro/escuro.
- Não editar os três arquivos canônicos `via-tokens.css`, `via-surfaces.css` e `via-data.css`; atualizações devem ser copiadas novamente do DS oficial e verificadas por checksum.
