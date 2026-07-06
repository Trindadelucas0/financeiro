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
    setTimeout(function () { el.remove(); }, 5200);
  }

  let clients = [];
  let clientModalSnapshot = null;
  let clientModalSubmitting = false;

  function formatDate(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  }

  function clientStatus(client) {
    const sub = client.subscription || {};
    if (sub.isPro) {
      if (sub.renewalDueSoon) {
        return { label: 'Vence em ' + sub.daysUntilExpiry + ' dia(s)', pill: 'warning' };
      }
      return { label: 'Ativo', pill: 'active' };
    }
    return { label: 'Expirado', pill: 'inactive' };
  }

  function computeSummary(items) {
    let active = 0;
    let dueSoon = 0;
    let expired = 0;

    items.forEach(function (c) {
      const sub = c.subscription || {};
      if (sub.isPro) {
        active += 1;
        if (sub.renewalDueSoon) dueSoon += 1;
      } else {
        expired += 1;
      }
    });

    return {
      total: items.length,
      active,
      dueSoon,
      expired,
    };
  }

  async function loadClients() {
    const view = document.getElementById('adminClientsView');
    view.innerHTML = '<div class="loading-state">Carregando…</div>';
    try {
      const data = await apiFetch('/api/admin/clients');
      clients = data.clients || [];
      renderClients();
    } catch (err) {
      view.innerHTML = '<div class="empty-state">' + esc(err.message) + '</div>';
    }
  }

  function renderClients() {
    const view = document.getElementById('adminClientsView');
    const summary = computeSummary(clients);

    view.innerHTML =
      '<div class="kpi-grid admin-clients-summary">' +
        '<div class="kpi accent-neutral"><span class="label">Total</span><span class="value">' + summary.total + '</span><span class="sub">clientes manuais</span></div>' +
        '<div class="kpi accent-green"><span class="label">Ativos</span><span class="value">' + summary.active + '</span><span class="sub">assinatura vigente</span></div>' +
        '<div class="kpi accent-amber"><span class="label">Vencendo</span><span class="value">' + summary.dueSoon + '</span><span class="sub">até 4 dias</span></div>' +
        '<div class="kpi accent-red"><span class="label">Expirados</span><span class="value">' + summary.expired + '</span><span class="sub">sem acesso Pro</span></div>' +
      '</div>' +

      '<div class="section-title-row"><h2>Clientes</h2><button type="button" class="btn btn-primary btn-sm" onclick="openClientModal()">+ Novo cliente</button></div>' +
      '<p class="hint admin-clients-hint">Cadastre quem paga direto para você. O acesso Pro dura 30 dias; renove registrando o pagamento mensal.</p>' +
      '<div class="panel"><div class="table-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Status</th><th>Vencimento</th><th>Cadastro</th><th></th></tr></thead><tbody>' +
      (clients.length === 0
        ? '<tr><td colspan="6"><div class="empty-state">Nenhum cliente manual cadastrado.</div></td></tr>'
        : clients.map(function (c) {
          const st = clientStatus(c);
          const sub = c.subscription || {};
          return '<tr>' +
            '<td>' + esc(c.nome) + '</td>' +
            '<td>' + esc(c.email) + '</td>' +
            '<td><span class="status-pill ' + esc(st.pill) + '">' + esc(st.label) + '</span></td>' +
            '<td class="mono">' + esc(formatDate(sub.currentPeriodEnd)) + '</td>' +
            '<td class="mono">' + esc(formatDate(c.createdAt)) + '</td>' +
            '<td class="row-actions"><button type="button" class="btn btn-primary btn-sm" onclick="registerPayment(\'' + c.id + '\')">Registrar pagamento</button></td>' +
          '</tr>';
        }).join('')) +
      '</tbody></table></div></div>';
  }

  function captureClientModalSnapshot() {
    const form = document.getElementById('clientForm');
    if (!form) return '';
    const data = {};
    form.querySelectorAll('input, select, textarea').forEach(function (el) {
      if (!el.id) return;
      data[el.id] = el.value;
    });
    return JSON.stringify(data);
  }

  function refreshClientModalSnapshot() {
    requestAnimationFrame(function () {
      clientModalSnapshot = captureClientModalSnapshot();
    });
  }

  function isClientModalDirty() {
    if (!clientModalSnapshot) return false;
    return captureClientModalSnapshot() !== clientModalSnapshot;
  }

  async function requestCloseClientModal() {
    if (clientModalSubmitting) return;
    if (isClientModalDirty()) {
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
    closeClientModal();
  }

  function closeClientModal() {
    clientModalSubmitting = false;
    clientModalSnapshot = null;
    const dialog = document.getElementById('clientModal');
    if (dialog) dialog.close();
  }

  function openClientModal() {
    const dialog = document.getElementById('clientModal');
    const body = document.getElementById('clientModalBody');
    clientModalSnapshot = null;

    body.innerHTML =
      '<div class="modal-header"><h3 id="clientModalTitle">Novo cliente manual</h3><button type="button" class="modal-close" aria-label="Fechar" onclick="requestCloseClientModal()">×</button></div>' +
      '<form id="clientForm">' +
        '<div class="field"><label for="c_nome">Nome</label><input id="c_nome" type="text" required autocomplete="name"></div>' +
        '<div class="field"><label for="c_email">E-mail</label><input id="c_email" type="email" required autocomplete="email"></div>' +
        '<div class="field"><label for="c_password">Senha <span class="hint">(opcional — gerada automaticamente se vazio)</span></label><input id="c_password" type="password" minlength="6" autocomplete="new-password"></div>' +
        '<p class="hint">O primeiro mês já entra como pago (+30 dias de acesso Pro).</p>' +
        '<div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="requestCloseClientModal()">Cancelar</button><button type="submit" class="btn btn-primary" id="clientSubmitBtn">Criar cliente</button></div>' +
      '</form>';

    document.getElementById('clientForm').onsubmit = async function (e) {
      e.preventDefault();
      if (clientModalSubmitting) return;
      const submitBtn = document.getElementById('clientSubmitBtn');
      clientModalSubmitting = true;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Criando…';
      }
      try {
        const body = {
          nome: document.getElementById('c_nome').value.trim(),
          email: document.getElementById('c_email').value.trim(),
        };
        const passwordVal = document.getElementById('c_password').value;
        if (passwordVal) body.password = passwordVal;

        const data = await apiFetch('/api/admin/clients', { method: 'POST', body });
        closeClientModal();
        loadClients();

        if (data.tempPassword) {
          toast('Cliente criado. Senha temporária: ' + data.tempPassword, 'success');
        } else {
          toast('Cliente criado com acesso Pro por 30 dias');
        }
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        clientModalSubmitting = false;
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Criar cliente';
        }
      }
    };

    dialog.showModal();
    refreshClientModalSnapshot();
    const first = dialog.querySelector('input');
    if (first) first.focus();
  }

  async function registerPayment(id) {
    const client = clients.find(function (c) { return String(c.id) === String(id); });
    if (!client) return;

    const ok = window.FinanceUI
      ? await FinanceUI.showConfirm({
        title: 'Registrar pagamento',
        message: 'Confirmar pagamento de ' + client.nome + '? O acesso Pro será estendido por mais 30 dias.',
        confirmLabel: 'Registrar',
        cancelLabel: 'Cancelar',
      })
      : window.confirm('Registrar pagamento de ' + client.nome + '?');

    if (!ok) return;

    try {
      const data = await apiFetch('/api/admin/clients/' + id + '/payments', { method: 'POST', body: {} });
      const end = data.periodEnd ? formatDate(data.periodEnd) : '';
      toast('Pagamento registrado. Novo vencimento: ' + end);
      loadClients();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  async function initAdminClients() {
    if (!FinanceAuth.requireAuth()) return;
    const ok = await FinanceAuth.initAppAuth();
    if (!ok || !(await FinanceAuth.requireAdminAsync())) return;

    if (window.FinanceUI) FinanceUI.init();

    const dialog = document.getElementById('clientModal');
    if (dialog && window.FinanceUI) {
      FinanceUI.bindModal(dialog, function () { requestCloseClientModal(); });
    }

    loadClients();
  }

  window.openClientModal = openClientModal;
  window.registerPayment = registerPayment;
  window.closeClientModal = closeClientModal;
  window.requestCloseClientModal = requestCloseClientModal;

  document.addEventListener('DOMContentLoaded', initAdminClients);
})();
