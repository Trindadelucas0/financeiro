(function () {
  'use strict';

  const { apiFetch } = window.FinanceAPI;

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

  let users = [];
  let feedback = [];
  let userModalSnapshot = null;
  let userModalSubmitting = false;

  async function loadUsers() {
    const view = document.getElementById('adminView');
    view.innerHTML = '<div class="loading-state">Carregando…</div>';
    try {
      const [usersData, feedbackData] = await Promise.all([
        apiFetch('/api/admin/users'),
        apiFetch('/api/admin/feedback'),
      ]);
      users = usersData.users || usersData.items || usersData || [];
      feedback = feedbackData.feedback || feedbackData || [];
      renderAdmin();
    } catch (err) {
      view.innerHTML = '<div class="empty-state">' + esc(err.message) + '</div>';
    }
  }

  function renderAdmin() {
    const view = document.getElementById('adminView');
    view.innerHTML =
      '<div class="section-title-row"><h2>Usuários</h2><button type="button" class="btn btn-primary btn-sm" onclick="openUserModal()">+ Novo usuário</button></div>' +
      '<div class="panel"><div class="table-wrap"><table><thead><tr><th>Nome</th><th>Username</th><th>E-mail</th><th>Papel</th><th>Status</th><th></th></tr></thead><tbody>' +
      (users.length === 0 ? '<tr><td colspan="6"><div class="empty-state">Nenhum usuário cadastrado.</div></td></tr>' :
        users.map(function (u) {
          return '<tr><td>' + esc(u.nome) + '</td><td class="mono">@' + esc(u.username) + '</td><td>' + esc(u.email) + '</td><td>' + esc(u.role) + '</td><td><span class="status-pill ' + (u.ativo !== false ? 'active' : 'inactive') + '">' + (u.ativo !== false ? 'Ativo' : 'Inativo') + '</span></td><td class="row-actions"><button type="button" class="btn btn-ghost btn-sm" onclick="editUser(\'' + u.id + '\')">Editar</button></td></tr>';
        }).join('')) +
      '</tbody></table></div></div>' +

      '<div class="section-title-row admin-feedback-panel"><h2>Sugestões</h2></div>' +
      '<div class="panel"><div class="table-wrap"><table><thead><tr><th>Data</th><th>Usuário</th><th>Tipo</th><th>Mensagem</th><th>Status</th><th></th></tr></thead><tbody>' +
      (feedback.length === 0 ? '<tr><td colspan="6"><div class="empty-state">Nenhuma sugestão recebida.</div></td></tr>' :
        feedback.map(function (f) {
          const date = f.createdAt ? new Date(f.createdAt).toLocaleString('pt-BR') : '—';
          return '<tr><td class="mono">' + esc(date) + '</td><td>' + esc(f.userNome) + ' <span class="mono">@' + esc(f.userUsername) + '</span></td><td>' + esc(f.tipo) + '</td><td>' + esc(f.mensagem) + '</td><td><span class="feedback-status-' + esc(f.status) + '">' + esc(f.status) + '</span></td><td class="row-actions">' +
            (f.status === 'novo' ? '<button type="button" class="btn btn-ghost btn-sm" onclick="markFeedbackRead(\'' + f.id + '\')">Marcar lido</button>' : '—') +
            '</td></tr>';
        }).join('')) +
      '</tbody></table></div></div>';
  }

  function captureUserModalSnapshot() {
    const form = document.getElementById('userForm');
    if (!form) return '';
    const data = {};
    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (!el.id) return;
      data[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    });
    return JSON.stringify(data);
  }

  function refreshUserModalSnapshot() {
    requestAnimationFrame(function () {
      userModalSnapshot = captureUserModalSnapshot();
    });
  }

  function isUserModalDirty() {
    if (!userModalSnapshot) return false;
    return captureUserModalSnapshot() !== userModalSnapshot;
  }

  function focusUserModalField() {
    const dialog = document.getElementById('userModal');
    if (!dialog) return;
    const field = dialog.querySelector('input:not([readonly]), select, textarea, button');
    if (field) field.focus();
  }

  async function requestCloseUserModal() {
    if (userModalSubmitting) return;
    if (isUserModalDirty()) {
      const ok = window.FinanceUI
        ? await FinanceUI.showConfirm({
          title: 'Descartar alterações?',
          message: 'Os dados preenchidos serão perdidos se você fechar agora.',
          confirmLabel: 'Descartar',
          cancelLabel: 'Continuar editando',
          danger: true,
        })
        : window.confirm('Descartar alterações?');
      if (!ok) return;
    }
    closeUserModal();
  }

  function closeUserModal() {
    userModalSubmitting = false;
    userModalSnapshot = null;
    const dialog = document.getElementById('userModal');
    if (dialog) dialog.close();
  }

  function openUserModal(user) {
    const dialog = document.getElementById('userModal');
    const body = document.getElementById('userModalBody');
    const editing = !!user;
    userModalSnapshot = null;

    body.innerHTML =
      '<div class="modal-header"><h3 id="userModalTitle">' + (editing ? 'Editar usuário' : 'Novo usuário') + '</h3><button type="button" class="modal-close" aria-label="Fechar" onclick="requestCloseUserModal()">×</button></div>' +
      '<form id="userForm">' +
        '<div class="field"><label for="u_nome">Nome</label><input id="u_nome" type="text" value="' + esc(user && user.nome) + '" required></div>' +
        '<div class="field"><label for="u_username">Username</label><input id="u_username" type="text" value="' + esc(user && user.username) + '" ' + (editing ? '' : 'placeholder="opcional — gerado do e-mail"') + ' pattern="[a-zA-Z0-9_]{3,30}" autocapitalize="off"></div>' +
        '<div class="field"><label for="u_email">E-mail</label><input id="u_email" type="email" value="' + esc(user && user.email) + '" ' + (editing ? 'readonly' : '') + ' required></div>' +
        (!editing ? '<div class="field"><label for="u_password">Senha</label><input id="u_password" type="password" minlength="6" required autocomplete="new-password"></div>' : '') +
        '<div class="field"><label for="u_role">Papel</label><select id="u_role"><option value="user"' + (user && user.role === 'user' ? ' selected' : '') + '>Usuário</option><option value="admin"' + (user && user.role === 'admin' ? ' selected' : '') + '>Admin</option></select></div>' +
        (editing ? '<div class="field"><label><input type="checkbox" id="u_ativo" ' + (user.ativo !== false ? 'checked' : '') + '> Conta ativa</label></div>' : '') +
        '<div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="requestCloseUserModal()">Cancelar</button><button type="submit" class="btn btn-primary" id="userSubmitBtn">' + (editing ? 'Salvar' : 'Criar') + '</button></div>' +
      '</form>';

    document.getElementById('userForm').onsubmit = async function (e) {
      e.preventDefault();
      if (userModalSubmitting) return;
      const submitBtn = document.getElementById('userSubmitBtn');
      const submitLabel = editing ? 'Salvar' : 'Criar';
      userModalSubmitting = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Salvando…';
      }
      try {
        const usernameVal = document.getElementById('u_username').value.trim();
        if (editing) {
          const body = {
            nome: document.getElementById('u_nome').value.trim(),
            role: document.getElementById('u_role').value,
            ativo: document.getElementById('u_ativo').checked,
          };
          if (usernameVal) body.username = usernameVal;
          await apiFetch('/api/admin/users/' + user.id, { method: 'PATCH', body });
          toast('Usuário atualizado');
        } else {
          const body = {
            nome: document.getElementById('u_nome').value.trim(),
            email: document.getElementById('u_email').value.trim(),
            password: document.getElementById('u_password').value,
            role: document.getElementById('u_role').value,
          };
          if (usernameVal) body.username = usernameVal;
          await apiFetch('/api/admin/users', { method: 'POST', body });
          toast('Usuário criado');
        }
        closeUserModal();
        loadUsers();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        userModalSubmitting = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitLabel;
        }
      }
    };

    dialog.showModal();
    refreshUserModalSnapshot();
    focusUserModalField();
  }

  function editUser(id) {
    const user = users.find(function (u) { return String(u.id) === String(id); });
    if (user) openUserModal(user);
  }

  async function markFeedbackRead(id) {
    try {
      await apiFetch('/api/admin/feedback/' + id, { method: 'PATCH' });
      toast('Marcado como lido');
      loadUsers();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  function initAdmin() {
    if (!FinanceAuth.requireAdmin()) return;
    FinanceAuth.initAppAuth();

    if (window.FinanceUI) FinanceUI.init();

    const dialog = document.getElementById('userModal');
    if (dialog && window.FinanceUI) {
      FinanceUI.bindModal(dialog, function () { requestCloseUserModal(); });
    }

    loadUsers();
  }

  window.openUserModal = function () { openUserModal(null); };
  window.editUser = editUser;
  window.closeUserModal = closeUserModal;
  window.requestCloseUserModal = requestCloseUserModal;
  window.markFeedbackRead = markFeedbackRead;

  document.addEventListener('DOMContentLoaded', initAdmin);
})();
