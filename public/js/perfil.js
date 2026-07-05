(function () {
  'use strict';

  const { apiFetch, getUser, setSession, getToken } = window.FinanceAPI;

  let usernameOk = true;
  let usernameCheckTimer = null;
  let originalUsername = '';

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
          '<div class="field"><label for="au_role">Papel</label>' +
          '<select id="au_role"><option value="user">Usuário</option><option value="admin">Admin</option></select></div>' +
          '<button type="submit" class="btn btn-primary btn-sm" id="adminCreateBtn">Criar usuário</button>' +
        '</form>' +
        '<div class="admin-users-list-wrap">' +
          '<h4 class="admin-users-title">Usuários cadastrados</h4>' +
          '<div id="adminUsersList" class="admin-users-list"><p class="profile-hint">Carregando…</p></div>' +
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

  async function loadAdminUsersList() {
    const el = document.getElementById('adminUsersList');
    if (!el) return;
    try {
      const data = await apiFetch('/api/admin/users');
      const users = data.users || [];
      if (users.length === 0) {
        el.innerHTML = '<p class="profile-hint">Nenhum usuário cadastrado.</p>';
        return;
      }
      el.innerHTML =
        '<ul class="admin-users-ul">' +
        users.map(function (u) {
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
          role: document.getElementById('au_role').value,
        };
        const usernameVal = normalizeUsernameInput(document.getElementById('au_username').value);
        if (usernameVal) body.username = usernameVal;

        await apiFetch('/api/admin/users', { method: 'POST', body: body });
        form.reset();
        toast('Usuário criado');
        loadAdminUsersList();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Criar usuário';
      }
    });

    loadAdminUsersList();
    loadAdminFeedbackList();
  }

  function renderProfile(user) {
    const view = document.getElementById('view');
    if (!view || !user) return;

    originalUsername = user.username || '';
    usernameOk = true;

    view.innerHTML =
      '<div class="profile-page">' +
        '<header class="profile-header">' +
          '<div class="profile-avatar" aria-hidden="true">' + esc(initials(user.nome)) + '</div>' +
          '<div class="profile-identity">' +
            '<h1>Minha conta</h1>' +
            '<p class="profile-email">' + esc(user.email) + '</p>' +
          '</div>' +
        '</header>' +

        '<section class="panel profile-section profile-section-account">' +
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
        '</section>' +

        (user.role === 'admin' ? renderAdminUsersSection() + renderAdminFeedbackSection() : '') +

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

        '<section class="panel profile-section pwa-install-banner" id="pwaSection">' +
          '<div class="panel-head"><h3>Instalar app</h3></div>' +
          '<p class="profile-hint" id="pwaHint"></p>' +
          '<button type="button" class="btn btn-primary btn-sm" id="pwaInstallBtn" hidden>Instalar no dispositivo</button>' +
        '</section>' +

        '<section class="panel profile-section">' +
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
        '</section>' +

        '<div class="profile-actions">' +
          '<button type="button" class="btn btn-ghost" id="profileLogoutBtn">Sair da conta</button>' +
        '</div>' +
      '</div>';

    view.setAttribute('aria-busy', 'false');
    bindProfileEvents(user);
    if (user.role === 'admin') bindAdminEvents();
    updatePwaUi();
  }

  function updatePwaUi() {
    const hint = document.getElementById('pwaHint');
    const btn = document.getElementById('pwaInstallBtn');
    if (!hint || !window.FinancePWA) return;

    hint.textContent = FinancePWA.getInstallHint();
    if (btn) btn.hidden = !FinancePWA.canInstall();
  }

  function bindProfileEvents(user) {
    const usernameInput = document.getElementById('pf_username');

    usernameInput.addEventListener('input', function () {
      const cleaned = normalizeUsernameInput(usernameInput.value);
      if (usernameInput.value !== cleaned) usernameInput.value = cleaned;
      scheduleUsernameCheck(cleaned);
    });

    usernameInput.addEventListener('blur', function () {
      checkUsernameAvailability(usernameInput.value);
    });

    document.getElementById('profileForm').addEventListener('submit', async function (e) {
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
        setSession(getToken(), data.user);
        if (window.FinanceAuth) FinanceAuth.updateUserUi(data.user);
        renderProfile(data.user);
        toast('Conta salva');
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = !usernameOk;
        btn.textContent = 'Salvar conta';
      }
    });

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

    document.getElementById('feedbackForm').addEventListener('submit', async function (e) {
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

    const pwaBtn = document.getElementById('pwaInstallBtn');
    if (pwaBtn) {
      pwaBtn.addEventListener('click', async function () {
        if (!window.FinancePWA) return;
        const result = await FinancePWA.promptInstall();
        if (result.outcome === 'accepted') toast('App instalado');
        updatePwaUi();
      });
    }

    document.getElementById('profileLogoutBtn').addEventListener('click', function () {
      if (window.FinanceAuth) FinanceAuth.logout();
    });

    document.addEventListener('pwa-install-ready', updatePwaUi);
    document.addEventListener('pwa-installed', updatePwaUi);
  }

  async function loadCurrentUser() {
    if (window.FinanceAuth && typeof FinanceAuth.refreshSession === 'function') {
      return FinanceAuth.refreshSession();
    }
    const data = await apiFetch('/api/auth/me');
    if (data && data.user) {
      setSession(getToken(), data.user);
      if (window.FinanceAuth && FinanceAuth.updateUserUi) FinanceAuth.updateUserUi(data.user);
      return data.user;
    }
    return getUser();
  }

  async function initPerfil() {
    if (!window.FinanceAuth || !FinanceAuth.requireAuth()) return;
    FinanceAuth.initAppAuth();

    const view = document.getElementById('view');
    if (view) view.setAttribute('aria-busy', 'true');

    try {
      const user = await loadCurrentUser();
      renderProfile(user || getUser());
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
