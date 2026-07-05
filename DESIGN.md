# Design System — Home Finanças

> Paleta em OKLCH. Estratégia: **Restrained** — preto puro + branco gelo como acento de identidade; verde **somente** para saldos e valores positivos; vermelho **somente** para negativo, pendências e alertas.

## Scene

Terminal financeiro pessoal à meia-noite — tela escura, acento branco gelo nos controles e marca, números positivos em verde, hierarquia tipográfica nítida.

## Color strategy

**Restrained** — superfície near-black neutra; branco gelo carrega botões, tabs, foco e identidade visual; verde aparece **apenas** em saldo positivo, `.val-pos` e projeção acima de zero; vermelho aparece **apenas** em déficit, pendências, atrasos e ações destrutivas (~8–12% da área visível).

### Tokens (OKLCH)

```css
:root {
  /* Surfaces — chroma 0, pure neutral black stack */
  --bg:           oklch(0.09 0 0);
  --surface:      oklch(0.13 0 0);
  --surface-2:    oklch(0.17 0 0);
  --surface-3:    oklch(0.21 0 0);
  --border:       oklch(0.24 0 0);

  /* Ink */
  --text:         oklch(0.93 0 0);
  --muted:        oklch(0.62 0.008 240);
  --muted-2:      oklch(0.52 0.01 240);

  /* Brand — branco gelo (identidade) */
  --ice:          oklch(0.94 0.008 240);
  --ice-hover:    oklch(0.97 0.006 240);
  --ice-dim:      oklch(0.24 0.015 240);
  --ice-glow:     oklch(0.94 0.008 240 / 0.14);
  --ice-ink:      oklch(0.12 0.02 240);

  /* Semântico positivo */
  --green:        oklch(0.78 0.16 155);
  --green-dim:    oklch(0.28 0.06 155);
  --green-glow:   oklch(0.78 0.16 155 / 0.15);

  /* Semântico negativo / alerta */
  --red:          oklch(0.72 0.14 25);
  --red-dim:      oklch(0.28 0.06 25);
  --amber:        oklch(0.82 0.14 85);
  --amber-dim:    oklch(0.30 0.06 85);
  --indigo:       oklch(0.72 0.10 275);
  --indigo-dim:   oklch(0.26 0.04 275);
}
```

### Text on fills

- Botão primário (`--ice`): texto `--ice-ink` (quase preto azulado), não branco puro.
- Badges/pills saturados: texto claro se L ≤ 0.35; escuro se L ≥ 0.85.

## Typography

| Role | Family | Weight | Size | Notes |
|------|--------|--------|------|-------|
| Display / KPI values | **DM Sans** | 700 | 1.375–1.75rem | tabular-nums |
| UI / body | **IBM Plex Sans** | 400–600 | 14px base | substitui Inter |
| Data / money | **IBM Plex Mono** | 500–600 | inherit | valores, meses, % |

Escala fixa (product UI): 11px meta · 12px caption · 13px body · 14px UI · 16px h2 · 17px h1 — ratio ≥ 1.25 entre degraus principais.

- `text-wrap: balance` em h1–h3
- Line-height body: 1.5; KPI: 1.2

## Spacing

Base 4px. Steps: 4 · 8 · 12 · 16 · 20 · 24 · 28 · 32 · 40 · 80 (footer).

## Radius

- Buttons/inputs: 10px
- Panels/KPI cards: 14px
- Pills/tags: 999px

## Components

| Component | Spec |
|-----------|------|
| KPI card | surface + border; bento hero ou mini; indicador lateral fino por semântica |
| Panel | surface, border, padding 20px; sem card dentro de card |
| Tab | underline 2px gelo no active; sem eyebrow uppercase em toda seção |
| Button primary | bg ice, texto escuro, hover +3% L |
| Button ghost | surface-2 + border |
| Progress bar | track ice-dim; fill ice (pago) ou vermelho (over budget) |
| Table | hover surface-2; mobile → card rows abaixo 768px |
| Modal | overlay blur leve; dialog nativo preferível a div custom |
| Alert | bg tint semantic (amber-dim / red-dim / ice-dim); sem border-left grossa colorida |
| Empty state | ícone mínimo + ação primária clara |
| Brand logo | PNG Home Finanças; sm 32px · default 36px · lg 72px |

## Motion

- Transições UI: 180ms `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quart)
- KPI count-up opcional no dashboard (respeitar reduced-motion)
- Sem bounce/elastic; sem page-load orchestration

## Layout

- Max-width app: 1280px
- KPI grid: 4 col → 2 col @900px → 1 col @480px
- Dashboard: KPI row → 3 panels → atrasados → forecast strip
- Z-index scale: dropdown 10 · sticky 20 · modal-backdrop 40 · modal 50

## Dashboard layout (bento)

Hierarquia assimétrica — **não** usar grid de 4 KPIs idênticos.

| Componente | Spec |
|------------|------|
| `.dash-bento` | Grid `1.4fr 1fr` · hero saldo à esquerda · 3 mini KPIs à direita |
| `.kpi-hero` | Saldo do mês focal · valor 2.25rem · glow verde/vermelho semântico · indicador lateral 3px |
| `.kpi-mini` | Receitas, despesas, devedor · densos · sparkline 28px · indicador lateral 2px |
| `.panel-hint-pill` | Meta mono em pill (`--surface-2`) no header dos painéis |
| `.paid-progress` | Barra ice para % pago (contas a pagar + pagamentos do mês) |
| `.chart-empty` | Mensagem + CTA “+ Novo lançamento” |

Ordem narrativa: pendências → saldo conta → bento KPIs → fluxo wide → grid 3 col → atrasados → projeção.

Mobile: hero full width → mini KPIs 2 col → stack painéis.

## Dashboard targets (visual)

1. **Bento KPI row** — saldo hero + 3 métricas compactas (substitui 4 cards clones)
2. **Fluxo do mês** — chart 280px, receitas ice / despesas vermelho
3. **Pagamentos** — barra de progresso + donut antes do gráfico
4. **Categorias** — donut + legenda grid 2 col
5. **Timeline / projeção** — painéis wide com empty state acionável
6. **Mobile** — bento stack + pending cards
