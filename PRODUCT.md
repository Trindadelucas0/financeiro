# Product

## Register

product

## Users

Pessoa física controlando finanças pessoais no Brasil. Usa o painel algumas vezes por semana — no fim do mês, ao pagar contas ou ao planejar parcelas. Contexto: desktop ou celular, muitas vezes à noite, quer ver números claros sem planilha.

## Product Purpose

Substituir planilha ou anotações soltas por um painel financeiro pessoal: cadastrar receitas e despesas, acompanhar o mês, marcar pagamentos, ver previsão e alertas. Sucesso = dados persistem entre sessões, saldo e pendências são confiáveis, interface preta/gelo transmite controle e clareza (não “app genérico de IA”).

## Brand Personality

Preciso, confiante, silencioso. Três palavras: **controle**, **clareza**, **disciplina**. Tom calmo — números falam; a UI não compete com os dados.

## Anti-references

- Gradientes roxo/azul típicos de SaaS
- Glassmorphism decorativo
- Cards idênticos com ícone + título em grid infinito
- Hero com métrica gigante + label pequena (template SaaS)
- Inter + Space Grotesk como “look de IA” (trocar por par tipográfico distintivo)
- Fundo cream/bege quente
- Animações bounce/elastic em tudo
- Dashboard colorido demais — branco gelo na identidade/UI; verde só onde importa (saldo positivo); vermelho só em negativo, pendências e alertas

## Design Principles

1. **Números primeiro** — KPIs e tabelas legíveis antes de decoração.
2. **Verde é semântico** — saldo positivo e `.val-pos`; vermelho em valores negativos/pendentes/alertas; gelo na identidade (botões, tabs, foco).
3. **Confiança operacional** — persistência, estados vazios úteis, feedback ao salvar/pagar.
4. **Densidade inteligente** — dashboard denso no desktop; cards empilhados no mobile.
5. **Previsibilidade** — mesma linguagem visual em todas as abas.

## Accessibility & Inclusion

- WCAG AA mínimo (contraste body ≥ 4.5:1, large text ≥ 3:1)
- `prefers-reduced-motion` respeitado em animações
- Labels associados a inputs; tabs e modais navegáveis por teclado
- Valores monetários com `tabular-nums` e locale pt-BR
