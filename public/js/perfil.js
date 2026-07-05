(function () {
  'use strict';

  const { apiFetch, getUser, setSession, getToken } = window.FinanceAPI;

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

  function renderProfile(user) {
    const view = document.getElementById('view');
    if (!view || !user) return;

    view.innerHTML =
      '<div class="profile-page">' +
        '<header class="profile-header">' +
          '<div class="profile-avatar" aria-hidden="true">' + esc(initials(user.nome)) + '</div>' +
          '<div class="profile-identity">' +
            '<h1>' + esc(user.nome) + '</h1>' +
            '<p class="profile-username mono">@' + esc(user.username) + '</p>' +
            '<p class="profile-email">' + esc(user.email) + '</p>' +
          '</div>' +
        '</header>' +

        '<section class="panel profile-section">' +
          '<div class="panel-head"><h3>Editar perfil</h3></div>' +
          '<form id="profileForm" class="profile-form">' +
            '<div class="field"><label for="pf_nome">Nome de exibição</label>' +
            '<input id="pf_nome" type="text" required maxlength="255" value="' + esc(user.nome) + '"></div>' +
            '<div class="field"><label for="pf_username">Username</label>' +
            '<input id="pf_username" type="text" required maxlength="30" pattern="[a-zA-Z0-9_]{3,30}" value="' + esc(user.username) + '" autocapitalize="off" autocomplete="username">' +
            '<span class="field-hint">3–30 caracteres: a-z, 0-9, _</span></div>' +
            '<button type="submit" class="btn btn-primary btn-sm" id="profileSaveBtn">Salvar perfil</button>' +
          '</form>' +
        '</section>' +

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
    document.getElementById('profileForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = document.getElementById('profileSaveBtn');
      btn.disabled = true;
      btn.textContent = 'Salvando…';
      try {
        const data = await apiFetch('/api/auth/me', {
          method: 'PATCH',
          body: {
            nome: document.getElementById('pf_nome').value.trim(),
            username: document.getElementById('pf_username').value.trim(),
          },
        });
        setSession(getToken(), data.user);
        if (window.FinanceAuth) FinanceAuth.updateUserUi(data.user);
        renderProfile(data.user);
        toast('Perfil atualizado');
      } catch (err) {
        toast(err.message, 'error');
        btn.disabled = false;
        btn.textContent = 'Salvar perfil';
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

  async function initPerfil() {
    if (!window.FinanceAuth || !FinanceAuth.requireAuth()) return;
    FinanceAuth.initAppAuth();

    const view = document.getElementById('view');
    if (view) view.setAttribute('aria-busy', 'true');

    try {
      const user = await FinanceAuth.refreshSession();
      renderProfile(user || getUser());
    } catch (err) {
      if (view) {
        view.innerHTML = '<div class="empty-state">' + esc(err.message) + '</div>';
        view.setAttribute('aria-busy', 'false');
      }
    }
  }

  window.FinancePerfil = { init: initPerfil };

  document.addEventListener('DOMContentLoaded', initPerfil);
})();
