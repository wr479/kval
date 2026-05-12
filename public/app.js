/**
 * Клиент: валидация (как на сервере), все запросы через fetch без перезагрузки страницы.
 */
(function () {
  'use strict';

  const RE_LOGIN = /^[a-zA-Z0-9]{6,}$/;
  const RE_FIO = /^[а-яА-ЯёЁ]+(?:\s+[а-яА-ЯёЁ]+)*$/;
  const RE_PHONE = /^8\(\d{3}\)\d{3}-\d{2}-\d{2}$/;
  const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let currentUser = null;

  const el = {
    blockReg: document.getElementById('blockRegistraciya'),
    blockAuth: document.getElementById('blockAvtorizaciya'),
    main: document.getElementById('mainAppContent'),
    adminPanel: document.getElementById('adminPanel'),
    headerUserBar: document.getElementById('headerUserBar'),
    headerUserLabel: document.getElementById('headerUserLabel'),
    formaRegistracii: document.getElementById('formaRegistracii'),
    formaAvtorizacii: document.getElementById('formaAvtorizacii'),
    formaZayavki: document.getElementById('formaZayavki'),
    perehodVhod: document.getElementById('perehodVhod'),
    perehodReg: document.getElementById('perehodReg'),
    logoutBtn: document.getElementById('logoutBtn'),
    myTicketsBody: document.getElementById('myTicketsBody'),
    adminTableBody: document.getElementById('adminTableBody'),
    otzyvKursId: document.getElementById('otzyvKursId'),
    otzyvText: document.getElementById('otzyvText'),
    sendOtzyvBtn: document.getElementById('sendOtzyvBtn'),
    statusModal: document.getElementById('statusModal'),
    closeStatusModal: document.getElementById('closeStatusModal'),
    cancelStatusBtn: document.getElementById('cancelStatusBtn'),
    statusChangeForm: document.getElementById('statusChangeForm'),
    statusZayavkaId: document.getElementById('statusZayavkaId'),
    newStatusSelect: document.getElementById('newStatusSelect'),
  };

  function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str == null ? '' : String(str);
    return d.innerHTML;
  }

  function paymentLabel(code) {
    if (code === 'cash') return 'Наличные';
    if (code === 'phone_transfer') return 'Перевод по номеру телефона';
    return escapeHtml(code);
  }

  function statusLabel(status) {
    switch (status) {
      case 'new':
        return 'Новая';
      case 'learning':
        return 'Идёт обучение';
      case 'done':
        return 'Обучение завершено';
      default:
        return status;
    }
  }

  function statusClass(status) {
    if (status === 'new') return 'status-new';
    if (status === 'learning') return 'status-learning';
    if (status === 'done') return 'status-done';
    return 'status-new';
  }

  function formatDateYmd(ymd) {
    if (!ymd || typeof ymd !== 'string') return '—';
    const [y, m, d] = ymd.split('-');
    if (!y || !m || !d) return escapeHtml(ymd);
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return dt.toLocaleDateString('ru-RU');
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return escapeHtml(iso);
    return dt.toLocaleString('ru-RU');
  }

  function showToast(message, isError) {
    const node = document.createElement('div');
    node.className = 'toast-notify' + (isError ? ' toast-error' : '');
    node.textContent = message;
    document.body.appendChild(node);
    setTimeout(function () {
      node.remove();
    }, 4500);
  }

  async function fetchApi(path, options) {
    const opts = options || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const res = await fetch(path, Object.assign({}, opts, { credentials: 'include', headers }));
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { error: text || 'Ошибка ответа сервера' };
    }
    if (!res.ok) {
      const msg = data.error || data.message || 'Запрос не выполнен';
      const det = data.details;
      const full =
        Array.isArray(det) && det.length ? msg + ' ' + det.join(' ') : msg;
      throw new Error(full);
    }
    return data;
  }

  function validateRegistrationClient() {
    const login = document.getElementById('regLogin').value.trim();
    const password = document.getElementById('regPassword').value;
    const fullName = document.getElementById('regFio').value.trim();
    const phone = document.getElementById('regPhone').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const errs = [];
    if (!RE_LOGIN.test(login)) errs.push('Логин: только латиница и цифры, не менее 6 символов.');
    if (password.length < 8) errs.push('Пароль: не менее 8 символов.');
    if (!RE_FIO.test(fullName)) errs.push('ФИО: только кириллица и пробелы между словами.');
    if (!RE_PHONE.test(phone)) errs.push('Телефон: формат 8(XXX)XXX-XX-XX.');
    if (!RE_EMAIL.test(email)) errs.push('Укажите корректный email.');
    return {
      ok: errs.length === 0,
      errs,
      payload: { login, password, full_name: fullName, phone, email },
    };
  }

  function validateApplicationClient() {
    const courseName = document.getElementById('kursName').value.trim();
    const startDate = document.getElementById('kursDate').value;
    const paymentMethod = document.getElementById('sposobOplaty').value;
    const errs = [];
    if (!courseName) errs.push('Укажите название курса.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) errs.push('Выберите дату начала.');
    if (paymentMethod !== 'cash' && paymentMethod !== 'phone_transfer') {
      errs.push('Выберите способ оплаты.');
    }
    return {
      ok: errs.length === 0,
      errs,
      payload: { course_name: courseName, start_date: startDate, payment_method: paymentMethod },
    };
  }

  function showGuestAuth() {
    el.blockReg.style.display = 'none';
    el.blockAuth.style.display = 'block';
  }

  function showGuestRegister() {
    el.blockAuth.style.display = 'none';
    el.blockReg.style.display = 'block';
  }

  function hideGuestBlocks() {
    el.blockReg.style.display = 'none';
    el.blockAuth.style.display = 'none';
  }

  function showMain(user) {
    currentUser = user;
    hideGuestBlocks();
    el.main.style.display = 'block';
    el.headerUserBar.classList.add('visible');
    el.headerUserLabel.textContent =
      (user.full_name || user.login || '') + (user.is_admin ? ' (администратор)' : '');
    el.adminPanel.style.display = user.is_admin ? 'block' : 'none';
    refreshData();
  }

  function showGuestLanding() {
    currentUser = null;
    el.main.style.display = 'none';
    el.adminPanel.style.display = 'none';
    el.headerUserBar.classList.remove('visible');
    el.blockReg.style.display = 'block';
    el.blockAuth.style.display = 'none';
  }

  async function refreshData() {
    await loadMyApplications();
    if (currentUser && currentUser.is_admin) {
      await loadAdminApplications();
    }
  }

  function renderMyRows(applications) {
    if (!applications || !applications.length) {
      el.myTicketsBody.innerHTML = '<tr><td colspan="6">Нет заявок</td></tr>';
      fillOtzyvSelect([]);
      return;
    }
    el.myTicketsBody.innerHTML = applications
      .map(function (a) {
        const review = a.review_text && String(a.review_text).trim()
          ? escapeHtml(a.review_text)
          : '—';
        return (
          '<tr>' +
          '<td>' +
          escapeHtml(a.course_name) +
          '</td>' +
          '<td>' +
          formatDateYmd(a.start_date) +
          '</td>' +
          '<td>' +
          paymentLabel(a.payment_method) +
          '</td>' +
          '<td><span class="status-tag ' +
          statusClass(a.status) +
          '">' +
          escapeHtml(statusLabel(a.status)) +
          '</span></td>' +
          '<td>' +
          formatDateTime(a.submitted_at) +
          '</td>' +
          '<td>' +
          review +
          '</td>' +
          '</tr>'
        );
      })
      .join('');
    fillOtzyvSelect(applications);
  }

  function fillOtzyvSelect(applications) {
    el.otzyvKursId.innerHTML = '<option value="">— выберите заявку —</option>';
    applications.forEach(function (a) {
      const opt = document.createElement('option');
      opt.value = String(a.id);
      opt.textContent = '#' + a.id + ' — ' + a.course_name;
      el.otzyvKursId.appendChild(opt);
    });
  }

  async function loadMyApplications() {
    try {
      const data = await fetchApi('/api/applications');
      renderMyRows(data.applications || []);
    } catch (e) {
      showToast(e.message || String(e), true);
    }
  }

  async function loadAdminApplications() {
    el.adminTableBody.innerHTML = '<tr><td colspan="8">Загрузка...</td></tr>';
    try {
      const data = await fetchApi('/api/admin/applications');
      const rows = data.applications || [];
      if (!rows.length) {
        el.adminTableBody.innerHTML = '<tr><td colspan="8">Нет заявок</td></tr>';
        return;
      }
      el.adminTableBody.innerHTML = rows
        .map(function (r) {
          const who = escapeHtml(r.user_full_name || '') + ' (' + escapeHtml(r.user_login || '') + ')';
          return (
            '<tr>' +
            '<td>' +
            r.id +
            '</td>' +
            '<td>' +
            who +
            '</td>' +
            '<td>' +
            escapeHtml(r.course_name) +
            '</td>' +
            '<td>' +
            formatDateYmd(r.start_date) +
            '</td>' +
            '<td>' +
            paymentLabel(r.payment_method) +
            '</td>' +
            '<td><span class="status-tag ' +
            statusClass(r.status) +
            '">' +
            escapeHtml(statusLabel(r.status)) +
            '</span></td>' +
            '<td>' +
            formatDateTime(r.submitted_at) +
            '</td>' +
            '<td class="action-cell">' +
            '<button type="button" class="btn-edit-status" title="Изменить статус" data-id="' +
            r.id +
            '" data-status="' +
            escapeHtml(r.status) +
            '">' +
            '<i class="fas fa-edit" style="color:#2c6e8f"></i>' +
            '</button>' +
            '</td>' +
            '</tr>'
          );
        })
        .join('');
    } catch (e) {
      el.adminTableBody.innerHTML =
        '<tr><td colspan="8">Не удалось загрузить заявки</td></tr>';
      showToast(e.message || String(e), true);
    }
  }

  function openStatusModal(appId, currentStatus) {
    el.statusZayavkaId.value = String(appId);
    el.newStatusSelect.value = currentStatus === 'done' ? 'done' : currentStatus;
    el.statusModal.classList.add('open');
  }

  function closeStatusModal() {
    el.statusModal.classList.remove('open');
  }

  document.addEventListener('click', function (ev) {
    const btn = ev.target.closest('.btn-edit-status');
    if (btn && btn.dataset.id) {
      openStatusModal(btn.dataset.id, btn.dataset.status || 'new');
    }
  });

  el.closeStatusModal.addEventListener('click', closeStatusModal);
  el.cancelStatusBtn.addEventListener('click', closeStatusModal);
  el.statusModal.addEventListener('click', function (ev) {
    if (ev.target === el.statusModal) closeStatusModal();
  });

  el.statusChangeForm.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const id = el.statusZayavkaId.value;
    const status = el.newStatusSelect.value;
    try {
      await fetchApi('/api/admin/applications/' + encodeURIComponent(id), {
        method: 'PATCH',
        body: JSON.stringify({ status: status }),
      });
      showToast('Статус обновлён');
      closeStatusModal();
      await loadAdminApplications();
      await loadMyApplications();
    } catch (e) {
      showToast(e.message || String(e), true);
    }
  });

  el.formaRegistracii.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const v = validateRegistrationClient();
    if (!v.ok) {
      v.errs.forEach(function (m) {
        showToast(m, true);
      });
      return;
    }
    try {
      const data = await fetchApi('/api/register', {
        method: 'POST',
        body: JSON.stringify(v.payload),
      });
      showToast(data.message || 'Готово');
      el.formaRegistracii.reset();
      showGuestAuth();
    } catch (e) {
      showToast(e.message || String(e), true);
    }
  });

  el.formaAvtorizacii.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const login = document.getElementById('authLogin').value.trim();
    const password = document.getElementById('authPassword').value;
    if (!login || !password) {
      showToast('Введите логин и пароль.', true);
      return;
    }
    try {
      const data = await fetchApi('/api/login', {
        method: 'POST',
        body: JSON.stringify({ login: login, password: password }),
      });
      showMain(data.user);
      el.formaAvtorizacii.reset();
    } catch (e) {
      showToast(e.message || String(e), true);
    }
  });

  el.formaZayavki.addEventListener('submit', async function (ev) {
    ev.preventDefault();
    const v = validateApplicationClient();
    if (!v.ok) {
      v.errs.forEach(function (m) {
        showToast(m, true);
      });
      return;
    }
    try {
      await fetchApi('/api/applications', {
        method: 'POST',
        body: JSON.stringify(v.payload),
      });
      showToast('Заявка отправлена со статусом «Новая»');
      el.formaZayavki.reset();
      await refreshData();
    } catch (e) {
      showToast(e.message || String(e), true);
    }
  });

  el.sendOtzyvBtn.addEventListener('click', async function () {
    const id = el.otzyvKursId.value;
    const text = el.otzyvText.value.trim();
    if (!id) {
      showToast('Выберите заявку для отзыва.', true);
      return;
    }
    if (!text) {
      showToast('Введите текст отзыва.', true);
      return;
    }
    try {
      await fetchApi('/api/applications/' + encodeURIComponent(id) + '/review', {
        method: 'PATCH',
        body: JSON.stringify({ review_text: text }),
      });
      showToast('Отзыв сохранён');
      el.otzyvText.value = '';
      await loadMyApplications();
    } catch (e) {
      showToast(e.message || String(e), true);
    }
  });

  el.logoutBtn.addEventListener('click', async function () {
    try {
      await fetchApi('/api/logout', { method: 'POST', body: '{}' });
    } catch {
      /* ignore */
    }
    showGuestLanding();
    showToast('Вы вышли из системы');
  });

  el.perehodVhod.addEventListener('click', showGuestAuth);
  el.perehodReg.addEventListener('click', showGuestRegister);

  /** Маска телефона 8(XXX)XXX-XX-XX — совпадает с серверной валидацией */
  function initRegPhoneMask() {
    const input = document.getElementById('regPhone');
    if (!input || typeof IMask === 'undefined') return;
    IMask(input, {
      mask: '{8}(000)000-00-00',
      lazy: false,
      overwrite: true,
      placeholderChar: '_',
    });
  }

  initRegPhoneMask();

  async function boot() {
    try {
      const data = await fetchApi('/api/session');
      if (data.authenticated && data.user) {
        showMain(data.user);
      } else {
        showGuestLanding();
      }
    } catch {
      showGuestLanding();
    }
  }

  boot();
})();
