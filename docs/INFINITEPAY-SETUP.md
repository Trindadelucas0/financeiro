# InfinitePay — configuração do plano Pro

Este guia lista os passos manuais para habilitar pagamentos via InfinitePay Checkout. O código do app (checkout, webhook, gate do PDF) já está implementado.

**Produção:** [https://cashome.avadesk.com.br/](https://cashome.avadesk.com.br/)

---

## Resumo rápido

1. Criar conta InfinitePay e obter sua **InfiniteTag** (`handle`)
2. Cadastrar `https://cashome.avadesk.com.br` no Checkout Integrado
3. Copiar [`.env.production.example`](../.env.production.example) para `.env` na VPS
4. Testar pagamento e exportação PDF

---

## Modelo de cobrança

- **R$ 9,90** por **30 dias** de acesso ao painel
- Sem plano gratuito — acesso exige pagamento ativo
- Admin usa o app sem pagar
- Ao expirar, o painel bloqueia e o usuário **renova manualmente** no perfil (Pix ou cartão)

---

## 1. Criar conta InfinitePay

1. Baixe o app ou acesse [https://www.infinitepay.io](https://www.infinitepay.io)
2. Complete o cadastro
3. Anote sua **InfiniteTag** (ex.: `$lucas-rodrigues-740` → use `lucas-rodrigues-740` no `.env`)

---

## 2. Ativar Checkout Integrado

1. App InfinitePay → **Vendas** → **Checkout**
2. Cadastre a URL do site:
   - **Produção:** `https://cashome.avadesk.com.br`
   - Dev (opcional): `http://localhost:3538`
3. Salve

Documentação oficial: [Como usar o Checkout da InfinitePay](https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-da-infinitepay)

### URLs geradas automaticamente pelo app (produção)

| Uso | URL |
|---|---|
| Redirect após compra na landing | `https://cashome.avadesk.com.br/login?checkout=success` |
| Redirect após renovação no perfil | `https://cashome.avadesk.com.br/app/perfil?checkout=success` |
| Webhook | `https://cashome.avadesk.com.br/api/payments/webhook` |

---

## 3. Preencher o `.env`

### Desenvolvimento local

No [`.env`](../.env):

```env
APP_URL=http://localhost:3538
INFINITEPAY_HANDLE=lucas-rodrigues-740
```

### Produção (VPS)

Copie [`.env.production.example`](../.env.production.example) para `.env` no servidor:

```env
APP_URL=https://cashome.avadesk.com.br
INFINITEPAY_HANDLE=lucas-rodrigues-740
JWT_SECRET=<string-longa-aleatoria>
# ... demais variáveis de banco e admin
```

**Importante:** não use o domínio de produção no `.env` local — o checkout redirecionaria para o site ao vivo.

Reinicie o servidor após alterar:

```bash
npm run dev    # local
npm start      # VPS
```

---

## 4. Webhook (produção)

Em desenvolvimento local, a confirmação usa o **redirect** com `GET /api/payments/welcome` (landing) ou `/api/payments/confirm` (perfil) como fallback.

Em produção, o webhook recebe notificações em tempo real:

- URL: `https://cashome.avadesk.com.br/api/payments/webhook`
- O app responde `200 OK` ao receber pagamento aprovado

Para testar webhook em dev, use um túnel (ngrok, Cloudflare Tunnel) apontando para `localhost:3538`.

---

## 5. Deploy na VPS

1. Proxy reverso (nginx/caddy): `https://cashome.avadesk.com.br` → `http://127.0.0.1:3538`
2. HTTPS válido (Let's Encrypt)
3. Na VPS:

```bash
npm install
npm run migrate
npm start
```

---

## 6. Testar o fluxo completo

### Compra na landing (novo cliente)

1. Acesse a home (`/` ou `https://cashome.avadesk.com.br`)
2. Na seção **Adquirir**, preencha **nome** e **e-mail**
3. Clique **Adquirir — R$ 9,90** e complete o checkout InfinitePay
4. Volte para `/login?checkout=success` com credenciais exibidas na tela
5. Entre com a senha temporária (ex.: `lucas123`) e defina uma nova senha
6. Exporte o **relatório PDF** — deve baixar sem erro 402

### Renovação no perfil (cliente existente)

#### Produção

1. Acesse [https://cashome.avadesk.com.br/login](https://cashome.avadesk.com.br/login)
2. Vá em **Meu perfil**
3. Clique **Renovar acesso — R$ 9,90**
4. Complete o checkout InfinitePay (Pix ou cartão)
5. Volte ao app → badge **Ativo** e data de validade (+30 dias)
6. O painel completo e o **relatório PDF** voltam a funcionar

#### Local

1. `npm run dev`
2. Login em `http://localhost:3538/login`
3. Mesmos passos de renovação acima

### Conferir no banco (opcional)

```sql
SELECT email, plan, subscription_status, subscription_current_period_end
FROM users
WHERE email = 'seu@email.com';

SELECT order_nsu, status, paid_at
FROM payment_orders
ORDER BY created_at DESC
LIMIT 5;
```

---

## Troubleshooting

### "Pagamentos em configuração" ao clicar Liberar acesso

- `INFINITEPAY_HANDLE` vazio no `.env`
- Reinicie o servidor após preencher

### Checkout abre mas assinatura continua inativa

- Pagamento ainda não confirmado — aguarde e recarregue o perfil
- Em dev, o redirect com `order_nsu` na URL dispara `/api/payments/confirm`
- Em produção, confira se o webhook está acessível

### Painel ou PDF retornam erro de assinatura

- Acesso expirou (`subscription_current_period_end` no passado)
- Faça logout/login ou abra perfil e renove
- Admin sempre tem acesso liberado

### Erro na API InfinitePay

- `handle` incorreto — confira a InfiniteTag no app
- URL `https://cashome.avadesk.com.br` não cadastrada no Checkout Integrado
- Valor do item em **centavos** (990 = R$ 9,90)

---

## Referência das rotas

| Método | Rota | Função |
|---|---|---|
| `GET` | `/api/payments/subscription` | Status do plano |
| `POST` | `/api/payments/checkout` | Gera link InfinitePay (logado, perfil) |
| `POST` | `/api/payments/guest-checkout` | Gera link InfinitePay (landing, sem login) |
| `GET` | `/api/payments/welcome` | Credenciais pós-pagamento da landing |
| `POST` | `/api/payments/confirm` | Confirma pagamento no redirect (perfil) |
| `POST` | `/api/payments/webhook` | Notificação InfinitePay |
| `GET` | `/api/finance/export/pdf` | PDF (requer assinatura ativa) |
| `GET` | `/api/finance/*` | Painel financeiro (requer assinatura ativa) |

---

## Suporte

- InfinitePay Checkout: [https://www.infinitepay.io/checkout](https://www.infinitepay.io/checkout)
- Central de Ajuda: [https://ajuda.infinitepay.io](https://ajuda.infinitepay.io)
