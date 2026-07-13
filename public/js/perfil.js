(function () {
  'use strict';

  const { apiFetch, getUser, setSession, getToken, getSubscription, getPricing } = window.FinanceAPI;

  let usernameOk = true;
  let usernameCheckTimer = null;
  let originalUsername = '';
  let adminUsersCache = [];
  let adminUsersExpanded = false;

  function esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function toast(msg, type) {
    type = type || 'success';
    const c = document.getElementById('toastContainer');
    if (!c) return;
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    c.appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  function initials(nome) {
    const parts = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function normalizeUsernameInput(raw) {
    return String(raw || '').trim().toLowerCase().replace(/^@/, '');
  }

  function setUsernameStatus(state, message) {
    const el = document.getElementById('usernameStatus');
    const btn = document.getElementById('profileSaveBtn');
    if (!el) return;

    el.className = 'username-status ' + (state || '');
    el.textContent = message || '';
    usernameOk = state === 'ok' || state === 'same';

    if (btn) btn.disabled = !usernameOk;
  }

  async function checkUsernameAvailability(value) {
    const normalized = normalizeUsernameInput(value);
    const statusEl = document.getElementById('usernameStatus');

    if (!normalized) {
      setUsernameStatus('err', 'Informe um nome de usuário');
      return;
    }

    if (normalized === originalUsername) {
      setUsernameStatus('same', 'Seu nome de usuário atual');
      return;
    }

    if (statusEl) {
      statusEl.className = 'username-status checking';
      statusEl.textContent = 'Verificando disponibilidade…';
    }

    try {
      const data = await apiFetch('/api/auth/username-available?username=' + encodeURIComponent(normalized));
      if (data.available) {
        setUsernameStatus('ok', '@' + data.username + ' disponível — use para entrar no app');
      } else {
        setUsernameStatus('err', data.reason || 'Nome de usuário indisponível');
      }
    } catch (err) {
      setUsernameStatus('err', err.message || 'Não foi possível verificar');
    }
  }

  function scheduleUsernameCheck(value) {
    clearTimeout(usernameCheckTimer);
    usernameCheckTimer = setTimeout(function () {
      checkUsernameAvailability(value);
    }, 400);
  }

  function feedbackTipoLabel(tipo) {
    const map = { sugestao: 'Sugestão', bug: 'Bug', outro: 'Outro' };
    return map[tipo] || tipo;
  }

  function renderAdminFeedbackSection() {
    return (
      '<section class="panel profile-section profile-section-admin profile-section-feedback">' +
        '<div class="panel-head"><h3>Sugestões de melhoria</h3><span class="panel-hint-pill">admin</span></div>' +
        '<p class="profile-hint">Mensagens enviadas pelos usuários na aba Conta.</p>' +
        '<div id="adminFeedbackList" class="admin-feedback-list"><p class="profile-hint">Carregando…</p></div>' +
      '</section>'
    );
  }

  function renderAdminUsersSection() {
    return (
      '<section class="panel profile-section profile-section-admin">' +
        '<div class="panel-head"><h3>Adicionar usuário</h3><span class="panel-hint-pill">admin</span></div>' +
        '<p class="profile-hint">Cadastre login com nome de usuário, e-mail e senha. A pessoa entra no app com @username ou e-mail.</p>' +
        '<form id="adminCreateUserForm" class="profile-form">' +
          '<div class="field"><label for="au_nome">Nome</label>' +
          '<input id="au_nome" type="text" required maxlength="255" autocomplete="name"></div>' +
          '<div class="field field-username">' +
            '<label for="au_username">Nome de usuário</label>' +
            '<div class="username-input-wrap">' +
              '<span class="username-prefix" aria-hidden="true">@</span>' +
              '<input id="au_username" type="text" maxlength="30" pattern="[a-zA-Z0-9_]{3,30}" placeholder="opcional" autocapitalize="off" autocomplete="off">' +
            '</div>' +
            '<span class="field-hint">Opcional — se vazio, gera do e-mail</span>' +
          '</div>' +
          '<div class="field"><label for="au_email">E-mail</label>' +
          '<input id="au_email" type="email" required autocomplete="email"></div>' +
          '<div class="field"><label for="au_password">Senha</label>' +
          '<input id="au_password" type="password" required minlength="6" autocomplete="new-password"></div>' +
          '<button type="submit" class="btn btn-primary btn-sm" id="adminCreateBtn">Criar usuário</button>' +
        '</form>' +
        '<div class="admin-users-list-wrap">' +
          '<div class="admin-users-list-head">' +
            '<h4 class="admin-users-title" id="adminUsersTitle">Usuários cadastrados</h4>' +
            '<input type="search" id="adminUsersSearch" class="admin-users-search" placeholder="Buscar por nome, @username ou e-mail" autocomplete="off">' +
          '</div>' +
          '<div id="adminUsersList" class="admin-users-list"><p class="profile-hint">Carregando…</p></div>' +
          '<button type="button" class="btn btn-ghost btn-sm admin-users-expand-btn" id="adminUsersExpandBtn" hidden>Mostrar todos</button>' +
        '</div>' +
      '</section>'
    );
  }

  async function loadAdminFeedbackList() {
    const el = document.getElementById('adminFeedbackList');
    if (!el) return;
    try {
      const data = await apiFetch('/api/admin/feedback');
      const items = data.feedback || [];
      if (items.length === 0) {
        el.innerHTML = '<p class="profile-hint">Nenhuma sugestão recebida ainda.</p>';
        return;
      }
      el.innerHTML =
        '<ul class="admin-feedback-ul">' +
        items.map(function (f) {
          const date = f.createdAt ? new Date(f.createdAt).toLocaleString('pt-BR') : '—';
          const isNew = f.status === 'novo';
          return (
            '<li class="admin-feedback-row' + (isNew ? ' is-new' : '') + '">' +
              '<div class="admin-feedback-head">' +
                '<div class="admin-feedback-user">' +
                  '<strong>' + esc(f.userNome) + '</strong>' +
                  '<span class="mono admin-user-handle">@' + esc(f.userUsername) + '</span>' +
                '</div>' +
                '<span class="feedback-status-' + esc(f.status) + '">' + esc(isNew ? 'Novo' : 'Lido') + '</span>' +
              '</div>' +
              '<div class="admin-feedback-meta">' +
                '<span class="admin-feedback-tipo">' + esc(feedbackTipoLabel(f.tipo)) + '</span>' +
                '<span class="admin-feedback-date mono">' + esc(date) + '</span>' +
              '</div>' +
              '<p class="admin-feedback-msg">' + esc(f.mensagem) + '</p>' +
              (isNew
                ? '<button type="button" class="btn btn-ghost btn-sm admin-feedback-read-btn" onclick="markAdminFeedbackRead(\'' + f.id + '\')">Marcar como lido</button>'
                : '') +
            '</li>'
          );
        }).join('') +
        '</ul>';
    } catch (err) {
      el.innerHTML = '<p class="username-status err">' + esc(err.message) + '</p>';
    }
  }

  async function markAdminFeedbackRead(id) {
    try {
      await apiFetch('/api/admin/feedback/' + id, { method: 'PATCH' });
      toast('Sugestão marcada como lida');
      loadAdminFeedbackList();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function renderAdminUsersList(users, query, expanded) {
    const el = document.getElementById('adminUsersList');
    const titleEl = document.getElementById('adminUsersTitle');
    const expandBtn = document.getElementById('adminUsersExpandBtn');
    if (!el) return;

    const q = String(query || '').trim().toLowerCase();
    const filtered = (users || []).filter(function (u) {
      if (!q) return true;
      return (
        String(u.nome || '').toLowerCase().includes(q)
        || String(u.username || '').toLowerCase().includes(q)
        || String(u.email || '').toLowerCase().includes(q)
      );
    });

    if (titleEl) {
      titleEl.textContent = 'Usuários cadastrados (' + (users || []).length + ')';
    }

    if (filtered.length === 0) {
      el.innerHTML = '<p class="profile-hint">' + (q ? 'Nenhum usuário encontrado.' : 'Nenhum usuário cadastrado.') + '</p>';
      if (expandBtn) expandBtn.hidden = true;
      return;
    }

    const limit = expanded || q ? filtered.length : 5;
    const visible = filtered.slice(0, limit);

    el.innerHTML =
      '<ul class="admin-users-ul">' +
      visible.map(function (u) {
        return (
          '<li class="admin-user-row">' +
            '<div class="admin-user-main">' +
              '<strong>' + esc(u.nome) + '</strong>' +
              '<span class="mono admin-user-handle">@' + esc(u.username) + '</span>' +
            '</div>' +
            '<div class="admin-user-meta">' +
              '<span>' + esc(u.email) + '</span>' +
              '<span class="status-pill ' + (u.ativo !== false ? 'active' : 'inactive') + '">' +
                (u.ativo !== false ? 'Ativo' : 'Inativo') +
              '</span>' +
            '</div>' +
          '</li>'
        );
      }).join('') +
      '</ul>';

    if (expandBtn) {
      const hiddenCount = filtered.length - visible.length;
      if (!q && hiddenCount > 0 && !expanded) {
        expandBtn.hidden = false;
        expandBtn.textContent = 'Mostrar todos (' + filtered.length + ')';
      } else {
        expandBtn.hidden = true;
      }
    }
  }

  async function loadAdminUsersList() {
    const el = document.getElementById('adminUsersList');
    if (!el) return;
    try {
      const data = await apiFetch('/api/admin/users');
      adminUsersCache = data.users || [];
      const searchEl = document.getElementById('adminUsersSearch');
      renderAdminUsersList(adminUsersCache, searchEl ? searchEl.value : '', adminUsersExpanded);
    } catch (err) {
      el.innerHTML = '<p class="username-status err">' + esc(err.message) + '</p>';
    }
  }

  function bindAdminEvents() {
    const form = document.getElementById('adminCreateUserForm');
    if (!form) return;

    const usernameInput = document.getElementById('au_username');
    if (usernameInput) {
      usernameInput.addEventListener('input', function () {
        const cleaned = normalizeUsernameInput(usernameInput.value);
        if (usernameInput.value !== cleaned) usernameInput.value = cleaned;
      });
    }

    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = document.getElementById('adminCreateBtn');
      btn.disabled = true;
      btn.textContent = 'Criando…';
      try {
        const body = {
          nome: document.getElementById('au_nome').value.trim(),
          email: document.getElementById('au_email').value.trim(),
          password: document.getElementById('au_password').value,
        };
        const usernameVal = normalizeUsernameInput(document.getElementById('au_username').value);
        if (usernameVal) body.username = usernameVal;

        await apiFetch('/api/admin/users', { method: 'POST', body: body });
        form.reset();
        adminUsersExpanded = false;
        toast('Usuário criado');
        loadAdminUsersList();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Criar usuário';
      }
    });

    const searchEl = document.getElementById('adminUsersSearch');
    if (searchEl) {
      searchEl.addEventListener('input', function () {
        renderAdminUsersList(adminUsersCache, searchEl.value, adminUsersExpanded);
      });
    }

    const expandBtn = document.getElementById('adminUsersExpandBtn');
    if (expandBtn) {
      expandBtn.addEventListener('click', function () {
        adminUsersExpanded = true;
        renderAdminUsersList(adminUsersCache, searchEl ? searchEl.value : '', true);
      });
    }

    loadAdminUsersList();
    loadAdminFeedbackList();
  }

  function formatPlanDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  }

  function planStatusLabel(status, isPro) {
    if (isPro) return 'Ativo';
    if (status === 'expired') return 'Expirado';
    return 'Acesso necessário';
  }

  function isSubscriptionBannerVisible() {
    const params = new URLSearchParams(window.location.search);
    return params.get('assinatura') === 'expirada';
  }

  function renderSubscriptionBanner(subscription) {
    if (!isSubscriptionBannerVisible() && subscription && subscription.isPro) return '';
    if (subscription && subscription.isPro) return '';

    const expired = subscription && subscription.status === 'expired';
    const title = expired ? 'Sua assinatura expirou' : 'Acesso necessário';
    const detail = expired
      ? 'Renove para voltar ao painel financeiro.'
      : 'Pague para liberar o painel completo por 30 dias.';

    return (
      '<div class="profile-paywall-banner" role="status">' +
        '<p class="profile-paywall-title">' + esc(title) + '</p>' +
        '<p class="profile-paywall-detail">' + esc(detail) + '</p>' +
      '</div>'
    );
  }

  function canUseFullProfile(user, subscription) {
    if (user && user.canManagePlatform) return true;
    return Boolean(subscription && subscription.isPro);
  }

  function renderPlanSection(subscription, pricing) {
    const sub = subscription || { plan: 'free', status: null, isPro: false, isTrial: false };
    const price = (pricing && pricing.label) || 'R$ 9,90 · 30 dias';
    const fullLabel = (pricing && pricing.subline) || price;
    const isPro = Boolean(sub.isPro);
    const isTrial = Boolean(sub.isTrial);
    const badgeClass = isPro ? 'plan-badge plan-badge-pro' : 'plan-badge plan-badge-expired';
    const badgeText = isPro
      ? (isTrial ? 'Trial' : 'Ativo')
      : (sub.status === 'expired' ? 'Expirado' : 'Inativo');
    const renewal = sub.currentPeriodEnd ? formatPlanDate(sub.currentPeriodEnd) : '';
    const priceShort = (pricing && pricing.priceShort) || 'R$ 9,90';

    let body = '';
    if (isPro) {
      if (isTrial) {
        body =
          '<p class="profile-hint">Trial ativo — painel completo liberado durante o período de teste.</p>' +
          (renewal
            ? '<p class="plan-meta"><span class="plan-trial-hint">Seu trial termina em ' + esc(renewal) + ' — depois renove por ' + esc(priceShort) + '</span></p>'
            : '') +
          '<button type="button" class="btn btn-primary btn-sm" id="planCheckoutBtn">Assinar agora — ' + esc(priceShort) + '</button>';
      } else {
        body =
          '<p class="profile-hint">Acesso ativo — painel completo, relatório PDF e previsão liberados.</p>' +
          (renewal
            ? '<p class="plan-meta"><span class="plan-renewal">Válido até ' + esc(renewal) + '</span></p>'
            : '') +
          '<button type="button" class="btn btn-primary btn-sm" id="planCheckoutBtn">Renovar acesso</button>';
      }
    } else {
      body =
        '<p class="profile-hint">' + esc(price) + '. Renove para continuar usando o painel.</p>' +
        '<p class="plan-meta">' +
          '<span class="plan-price">' + esc(fullLabel) + '</span>' +
        '</p>' +
        '<button type="button" class="btn btn-primary btn-sm" id="planCheckoutBtn">Renovar acesso — ' + esc(priceShort) + '</button>';
    }

    return (
      renderSubscriptionBanner(sub) +
      '<section class="panel profile-section profile-section-plan">' +
        '<div class="panel-head"><h3>Assinatura</h3><span class="' + badgeClass + '">' + badgeText + '</span></div>' +
        body +
      '</section>'
    );
  }

  async function startCheckout() {
    const btn = document.getElementById('planCheckoutBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Abrindo checkout…';
    }
    try {
      const data = await apiFetch('/api/payments/checkout', { method: 'POST', body: {} });
      if (data && data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('URL de checkout não retornada');
    } catch (err) {
      const msg = err.status === 503
        ? 'Pagamentos em configuração. Tente novamente mais tarde.'
        : (err.message || 'Não foi possível iniciar o checkout');
      toast(msg, 'error');
      if (btn) {
        btn.disabled = false;
        const pricing = getPricing();
        btn.textContent = subIsPro() ? 'Renovar acesso' : ('Renovar acesso — ' + ((pricing && pricing.priceShort) || 'R$ 9,90'));
      }
    }
  }

  function subIsPro() {
    const sub = getSubscription();
    return sub && sub.isPro;
  }

  async function confirmPaymentFromRedirect(params) {
    const orderNsu = params.get('order_nsu');
    const transactionNsu = params.get('transaction_nsu');
    const slug = params.get('slug');

    if (!orderNsu) return { ok: false, subscription: null };

    const body = {
      order_nsu: orderNsu,
      transaction_nsu: transactionNsu || undefined,
      slug: slug || undefined,
    };

    const maxAttempts = 10;
    const intervalMs = 3000;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const data = await apiFetch('/api/payments/confirm', {
          method: 'POST',
          body: body,
        });
        if (data && data.subscription) {
          setSession(getToken(), getUser(), data.subscription, data.pricing || getPricing());
        }
        return { ok: true, subscription: data && data.subscription ? data.subscription : null };
      } catch (err) {
        if (err.status === 402 && attempt < maxAttempts - 1) {
          await new Promise(function (resolve) { setTimeout(resolve, intervalMs); });
          continue;
        }
        if (err.status !== 402) {
          toast(err.message || 'Não foi possível confirmar o pagamento', 'error');
        }
        return { ok: false, subscription: null };
      }
    }

    return { ok: false, subscription: null };
  }

  async function handleCheckoutQuery() {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get('checkout');
    if (!checkout) return;

    if (checkout === 'success') {
      toast('Pagamento recebido! Confirmando seu acesso…');
      const result = await confirmPaymentFromRedirect(params);
      try {
        const data = await apiFetch('/api/auth/me');
        if (data) {
          setSession(getToken(), data.user, data.subscription || null, data.pricing || null);
        }
        const subscription = (data && data.subscription) || result.subscription;
        if (subscription && subscription.isPro) {
          window.location.href = '/app/dashboard';
          return;
        }
      } catch (_) { /* ignore */ }
      if (!result.ok) {
        toast('Pagamento ainda em confirmação. Atualize a página em alguns segundos.', 'error');
      }
    } else if (checkout === 'cancel') {
      toast('Checkout cancelado', 'error');
    }

    params.delete('checkout');
    params.delete('order_nsu');
    params.delete('transaction_nsu');
    params.delete('slug');
    params.delete('receipt_url');
    params.delete('capture_method');
    const qs = params.toString();
    const next = window.location.pathname + (qs ? '?' + qs : '');
    window.history.replaceState({}, '', next);
  }

  function renderProfile(user, subscription, pricing) {
    const view = document.getElementById('view');
    if (!view || !user) return;

    originalUsername = user.username || '';
    usernameOk = true;
    const fullAccess = canUseFullProfile(user, subscription);

    view.innerHTML =
      '<div class="profile-page">' +
        '<header class="profile-header">' +
          '<div class="profile-avatar" aria-hidden="true">' + esc(initials(user.nome)) + '</div>' +
          '<div class="profile-identity">' +
            '<h1>Minha conta</h1>' +
            (user.username ? '<p class="profile-username mono">@' + esc(user.username) + '</p>' : '') +
            '<p class="profile-email">' + esc(user.email) + '</p>' +
          '</div>' +
        '</header>' +

        renderPlanSection(subscription, pricing) +

        (fullAccess
          ? '<section class="panel profile-section profile-section-account">' +
              '<div class="panel-head"><h3>Nome de usuário</h3><span class="panel-hint-pill">login</span></div>' +
              '<p class="profile-hint">Escolha um nome único para entrar no app (com ou sem @). Não pode repetir.</p>' +
              '<form id="profileForm" class="profile-form">' +
                '<div class="field field-username">' +
                  '<label for="pf_username">Nome de usuário</label>' +
                  '<div class="username-input-wrap">' +
                    '<span class="username-prefix" aria-hidden="true">@</span>' +
                    '<input id="pf_username" type="text" required maxlength="30" pattern="[a-zA-Z0-9_]{3,30}" value="' + esc(user.username) + '" autocapitalize="off" autocomplete="username" aria-describedby="usernameStatus">' +
                  '</div>' +
                  '<p class="username-status same" id="usernameStatus">Seu nome de usuário atual</p>' +
                '</div>' +
                '<div class="field"><label for="pf_nome">Nome de exibição</label>' +
                '<input id="pf_nome" type="text" required maxlength="255" value="' + esc(user.nome) + '"></div>' +
                '<button type="submit" class="btn btn-primary btn-sm" id="profileSaveBtn">Salvar conta</button>' +
              '</form>' +
            '</section>'
          : '') +

        '<section class="panel profile-section">' +
          '<div class="panel-head"><h3>Alterar senha</h3></div>' +
          '<form id="passwordForm" class="profile-form">' +
            '<div class="field"><label for="pf_current">Senha atual</label>' +
            '<input id="pf_current" type="password" autocomplete="current-password" required></div>' +
            '<div class="field"><label for="pf_new">Nova senha</label>' +
            '<input id="pf_new" type="password" autocomplete="new-password" minlength="6" required></div>' +
            '<div class="field"><label for="pf_confirm">Confirmar nova senha</label>' +
            '<input id="pf_confirm" type="password" autocomplete="new-password" minlength="6" required></div>' +
            '<button type="submit" class="btn btn-ghost btn-sm" id="passwordSaveBtn">Atualizar senha</button>' +
          '</form>' +
        '</section>' +

        (fullAccess
          ? '<div class="profile-device-group">' +
              '<section class="panel profile-section pwa-install-banner" id="pwaSection">' +
                '<div class="panel-head"><h3>Instalar app</h3></div>' +
                '<p class="profile-hint" id="pwaHint"></p>' +
                '<button type="button" class="btn btn-primary btn-sm" id="pwaInstallBtn" hidden>Instalar no dispositivo</button>' +
              '</section>' +
              '<section class="panel profile-section" id="pushSection">' +
                '<div class="panel-head"><h3>Notificações</h3></div>' +
                '<p class="profile-hint" id="pushHint"></p>' +
                '<p class="profile-hint profile-hint-sub" id="pushGreetingHint" hidden></p>' +
                '<p class="profile-hint profile-hint-sub" id="pushTimezoneHint" hidden></p>' +
                '<div class="push-actions">' +
                  '<button type="button" class="btn btn-primary btn-sm" id="pushEnableBtn" hidden>Ativar notificações</button>' +
                  '<button type="button" class="btn btn-ghost btn-sm" id="pushDisableBtn" hidden>Desativar notificações</button>' +
                '</div>' +
                '<div class="push-prefs" id="pushPrefs" hidden>' +
                  '<label class="push-pref-row">' +
                    '<input type="checkbox" id="pushPrefSaudacoes" checked> Saudações do dia' +
                  '</label>' +
                  '<label class="push-pref-row">' +
                    '<input type="checkbox" id="pushPrefVencimentos" checked> Contas a vencer' +
                  '</label>' +
                  '<label class="push-pref-row">' +
                    '<input type="checkbox" id="pushPrefAtrasados" checked> Contas atrasadas' +
                  '</label>' +
                  '<label class="push-pref-row">' +
                    '<input type="checkbox" id="pushPrefOrcamento" checked> Orçamento' +
                  '</label>' +
                  '<label class="push-pref-row">' +
                    '<input type="checkbox" id="pushPrefAssinatura" checked> Assinatura' +
                  '</label>' +
                '</div>' +
              '</section>' +
            '</div>'
          : '') +

        (fullAccess
          ? '<section class="panel profile-section">' +
              '<div class="panel-head"><h3>Enviar sugestão</h3></div>' +
              '<form id="feedbackForm" class="profile-form">' +
                '<div class="field"><label for="fb_tipo">Tipo</label>' +
                '<select id="fb_tipo" required>' +
                  '<option value="sugestao">Sugestão de melhoria</option>' +
                  '<option value="bug">Reportar problema</option>' +
                  '<option value="outro">Outro</option>' +
                '</select></div>' +
                '<div class="field"><label for="fb_msg">Mensagem</label>' +
                '<textarea id="fb_msg" rows="4" required minlength="10" maxlength="2000" placeholder="Descreva sua ideia ou o que podemos melhorar…"></textarea></div>' +
                '<button type="submit" class="btn btn-primary btn-sm" id="feedbackBtn">Enviar</button>' +
              '</form>' +
            '</section>'
          : '') +

        (user.canManagePlatform
          ? '<div class="profile-admin-zone">' +
              '<p class="profile-admin-zone-label">Administração</p>' +
              renderAdminUsersSection() +
              renderAdminFeedbackSection() +
            '</div>'
          : '') +

        '<div class="profile-actions">' +
          '<button type="button" class="btn btn-ghost" id="profileLogoutBtn">Sair da conta</button>' +
        '</div>' +
      '</div>';

    view.setAttribute('aria-busy', 'false');
    bindProfileEvents(user);
    if (user.canManagePlatform) bindAdminEvents();
    updatePwaUi();
    updatePushUi().catch(function () { /* handled in updatePushUi */ });

    const checkoutBtn = document.getElementById('planCheckoutBtn');
    if (checkoutBtn) checkoutBtn.addEventListener('click', startCheckout);
  }

  function updatePwaUi() {
    const hint = document.getElementById('pwaHint');
    const btn = document.getElementById('pwaInstallBtn');
    if (!hint || !window.FinancePWA) return;

    hint.textContent = FinancePWA.getInstallHint();
    if (btn) btn.hidden = !FinancePWA.canInstall();
  }

  async function updatePushUi() {
    const section = document.getElementById('pushSection');
    if (!section || !window.FinancePush) return;

    const hint = document.getElementById('pushHint');
    const greetingHint = document.getElementById('pushGreetingHint');
    const timezoneHint = document.getElementById('pushTimezoneHint');
    const enableBtn = document.getElementById('pushEnableBtn');
    const disableBtn = document.getElementById('pushDisableBtn');
    const prefsBox = document.getElementById('pushPrefs');

    try {
      const status = await FinancePush.loadStatus();
      if (hint) hint.textContent = status.hint || FinancePush.getSupportHint();

      const canSubscribe = status.supported && status.pushEnabled && status.permission !== 'denied';
      const isActive = status.subscribed && status.preferences && status.preferences.enabled;

      if (enableBtn) enableBtn.hidden = !canSubscribe || isActive;
      if (disableBtn) disableBtn.hidden = !isActive;
      if (prefsBox) prefsBox.hidden = !isActive;

      if (greetingHint && window.FinancePush.getGreetingHint) {
        greetingHint.textContent = FinancePush.getGreetingHint();
        greetingHint.hidden = !isActive;
      }

      if (timezoneHint && status.preferences && status.preferences.timezone) {
        timezoneHint.textContent = 'Fuso: ' + status.preferences.timezone;
        timezoneHint.hidden = !isActive;
      } else if (timezoneHint) {
        timezoneHint.hidden = true;
      }

      if (status.preferences) {
        const map = {
          pushPrefSaudacoes: status.preferences.saudacoes,
          pushPrefVencimentos: status.preferences.vencimentos,
          pushPrefAtrasados: status.preferences.atrasados,
          pushPrefOrcamento: status.preferences.orcamento,
          pushPrefAssinatura: status.preferences.assinatura,
        };
        Object.keys(map).forEach(function (id) {
          const el = document.getElementById(id);
          if (el) el.checked = Boolean(map[id]);
        });
      }
    } catch (err) {
      if (hint) hint.textContent = err.message || 'Não foi possível carregar notificações.';
      if (enableBtn) enableBtn.hidden = true;
      if (disableBtn) disableBtn.hidden = true;
      if (prefsBox) prefsBox.hidden = true;
      if (greetingHint) greetingHint.hidden = true;
      if (timezoneHint) timezoneHint.hidden = true;
    }
  }

  function bindPushPrefToggles() {
    const ids = ['pushPrefSaudacoes', 'pushPrefVencimentos', 'pushPrefAtrasados', 'pushPrefOrcamento', 'pushPrefAssinatura'];
    const keys = ['saudacoes', 'vencimentos', 'atrasados', 'orcamento', 'assinatura'];

    ids.forEach(function (id, idx) {
      const el = document.getElementById(id);
      if (!el || !window.FinancePush) return;
      el.addEventListener('change', async function () {
        try {
          await FinancePush.savePreferences({ [keys[idx]]: el.checked });
        } catch (err) {
          toast(err.message, 'error');
          el.checked = !el.checked;
        }
      });
    });
  }

  function bindProfileEvents(user) {
    const usernameInput = document.getElementById('pf_username');
    const profileForm = document.getElementById('profileForm');

    if (usernameInput && profileForm) {
      usernameInput.addEventListener('input', function () {
        const cleaned = normalizeUsernameInput(usernameInput.value);
        if (usernameInput.value !== cleaned) usernameInput.value = cleaned;
        scheduleUsernameCheck(cleaned);
      });

      usernameInput.addEventListener('blur', function () {
        checkUsernameAvailability(usernameInput.value);
      });

      profileForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        if (!usernameOk) {
          toast('Escolha um nome de usuário disponível', 'error');
          return;
        }

        const btn = document.getElementById('profileSaveBtn');
        btn.disabled = true;
        btn.textContent = 'Salvando…';
        try {
          const data = await apiFetch('/api/auth/me', {
            method: 'PATCH',
            body: {
              nome: document.getElementById('pf_nome').value.trim(),
              username: normalizeUsernameInput(document.getElementById('pf_username').value),
            },
          });
          setSession(getToken(), data.user, getSubscription());
          if (window.FinanceAuth) FinanceAuth.updateUserUi(data.user);
          renderProfile(data.user, getSubscription(), getPricing());
          toast('Conta salva');
        } catch (err) {
          toast(err.message, 'error');
          btn.disabled = !usernameOk;
          btn.textContent = 'Salvar conta';
        }
      });
    }

    document.getElementById('passwordForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      const newPass = document.getElementById('pf_new').value;
      const confirm = document.getElementById('pf_confirm').value;
      if (newPass !== confirm) {
        toast('As senhas não coincidem', 'error');
        return;
      }
      const btn = document.getElementById('passwordSaveBtn');
      btn.disabled = true;
      btn.textContent = 'Salvando…';
      try {
        await apiFetch('/api/auth/me/password', {
          method: 'PATCH',
          body: {
            currentPassword: document.getElementById('pf_current').value,
            newPassword: newPass,
          },
        });
        document.getElementById('passwordForm').reset();
        toast('Senha atualizada');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Atualizar senha';
      }
    });

    const feedbackForm = document.getElementById('feedbackForm');
    if (feedbackForm) {
      feedbackForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const btn = document.getElementById('feedbackBtn');
        btn.disabled = true;
        btn.textContent = 'Enviando…';
        try {
          await apiFetch('/api/feedback', {
            method: 'POST',
            body: {
              tipo: document.getElementById('fb_tipo').value,
              mensagem: document.getElementById('fb_msg').value.trim(),
            },
          });
          document.getElementById('feedbackForm').reset();
          toast('Sugestão enviada. Obrigado!');
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = 'Enviar';
        }
      });
    }

    const pwaBtn = document.getElementById('pwaInstallBtn');
    if (pwaBtn) {
      pwaBtn.addEventListener('click', async function () {
        if (!window.FinancePWA) return;
        const result = await FinancePWA.promptInstall();
        if (result.outcome === 'accepted') toast('App instalado');
        updatePwaUi();
      });
    }

    const pushEnableBtn = document.getElementById('pushEnableBtn');
    if (pushEnableBtn) {
      pushEnableBtn.addEventListener('click', async function () {
        if (!window.FinancePush) return;
        pushEnableBtn.disabled = true;
        pushEnableBtn.textContent = 'Ativando…';
        try {
          await FinancePush.subscribe();
          toast('Notificações ativadas');
          await updatePushUi();
        } catch (err) {
          toast(err.message, 'error');
          await updatePushUi();
        } finally {
          pushEnableBtn.disabled = false;
          pushEnableBtn.textContent = 'Ativar notificações';
        }
      });
    }

    const pushDisableBtn = document.getElementById('pushDisableBtn');
    if (pushDisableBtn) {
      pushDisableBtn.addEventListener('click', async function () {
        if (!window.FinancePush) return;
        pushDisableBtn.disabled = true;
        try {
          await FinancePush.unsubscribe();
          toast('Notificações desativadas');
          await updatePushUi();
        } catch (err) {
          toast(err.message, 'error');
        } finally {
          pushDisableBtn.disabled = false;
        }
      });
    }

    bindPushPrefToggles();

    document.getElementById('profileLogoutBtn').addEventListener('click', function () {
      if (window.FinanceAuth) FinanceAuth.logout();
    });

    document.addEventListener('pwa-install-ready', updatePwaUi);
    document.addEventListener('pwa-installed', updatePwaUi);
  }

  async function initPerfil() {
    if (!window.FinanceAuth || !FinanceAuth.requireAuth()) return;
    const ok = await FinanceAuth.initAppAuth();
    if (!ok) return;
    await handleCheckoutQuery();

    const view = document.getElementById('view');
    if (view) view.setAttribute('aria-busy', 'true');

    try {
      const user = getUser();
      renderProfile(user, getSubscription(), getPricing());
      try {
        const pending = sessionStorage.getItem('finance_subscription_toast');
        if (pending) {
          sessionStorage.removeItem('finance_subscription_toast');
          toast(pending, 'error');
        }
      } catch (e) { /* ignore */ }
    } catch (err) {
      if (view) {
        view.innerHTML = '<div class="empty-state">' + esc(err.message) + '</div>';
        view.setAttribute('aria-busy', 'false');
      }
    }
  }

  window.FinancePerfil = { init: initPerfil };
  window.markAdminFeedbackRead = markAdminFeedbackRead;

  document.addEventListener('DOMContentLoaded', initPerfil);
})();
