(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const toast = $('#toast');
  function showToast(msg, isErr = false) {
    toast.textContent = msg;
    toast.className = 'toast show' + (isErr ? ' err' : '');
    setTimeout(() => toast.classList.remove('show'), 3200);
  }

  async function api(path, options = {}) {
    const res = await fetch(path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    });
    if (res.status === 401) {
      window.location.href = '/admin/login.html';
      throw new Error('unauthorized');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'حدث خطأ');
    return data;
  }

  async function uploadFile(file) {
    const fd = new FormData();
    fd.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    if (res.status === 401) { window.location.href = '/admin/login.html'; throw new Error('unauthorized'); }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'فشل رفع الملف');
    return data.url;
  }

  // ---------- auth guard ----------
  api('/api/auth/me').then((me) => {
    $('#userBadge').textContent = me.email + (me.role === 'super_admin' ? ' — مدير رئيسي' : '');
  }).catch(() => {});

  $('#logoutBtn').addEventListener('click', async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/admin/login.html';
  });

  // ---------- sidebar / navigation ----------
  const sections = ['overview', 'services', 'portfolio', 'orders', 'messages', 'settings'];
  const titles = { overview: 'نظرة عامة', services: 'إدارة الخدمات', portfolio: 'إدارة معرض الأعمال', orders: 'طلبات العملاء', messages: 'رسائل التواصل', settings: 'إعدادات الموقع' };
  function showSection(name) {
    sections.forEach((s) => { $('#sec-' + s).style.display = s === name ? 'block' : 'none'; });
    $$('.side-link[data-section]').forEach((a) => a.classList.toggle('active', a.dataset.section === name));
    $('#sectionTitle').textContent = titles[name];
    $('#sidebar').classList.remove('open');
    if (name === 'overview') loadOverview();
    if (name === 'services') loadServices();
    if (name === 'portfolio') loadPortfolio();
    if (name === 'orders') loadOrders();
    if (name === 'messages') loadMessages();
    if (name === 'settings') loadSettings();
  }
  $$('.side-link[data-section]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault(); showSection(a.dataset.section);
  }));
  $('#sidebarToggle')?.addEventListener('click', () => $('#sidebar').classList.toggle('open'));

  // ---------- modal helper ----------
  const overlay = $('#modalOverlay');
  const modalBox = $('#modalBox');
  function openModal(html) { modalBox.innerHTML = html; overlay.classList.add('open'); }
  function closeModal() { overlay.classList.remove('open'); modalBox.innerHTML = ''; }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  // ================= OVERVIEW =================
  async function loadOverview() {
    try {
      const s = await api('/api/stats');
      $('#statGrid').innerHTML = `
        ${statCard(s.totalOrders, 'إجمالي الطلبات')}
        ${statCard(s.newOrders, 'طلبات جديدة')}
        ${statCard(s.services, 'عدد الخدمات')}
        ${statCard(s.portfolio, 'عدد الأعمال')}
        ${statCard(s.messages, 'الرسائل')}
        ${statCard(s.unreadMessages, 'رسائل غير مقروءة')}
      `;
      const tbody = $('#recentOrdersTable tbody');
      tbody.innerHTML = s.recentOrders.map((o) => `
        <tr><td>${o.customer_name}</td><td>${o.service_name || '-'}</td><td>${statusPill(o.status)}</td><td>${fmtDate(o.created_at)}</td></tr>
      `).join('') || '<tr><td colspan="4" style="color:var(--ink-muted)">لا توجد طلبات بعد</td></tr>';
    } catch (e) { showToast(e.message, true); }
  }
  function statCard(num, label) { return `<div class="stat-card"><div class="num">${num}</div><div class="label">${label}</div></div>`; }
  function fmtDate(s) { try { return new Date(s.replace(' ', 'T') + 'Z').toLocaleDateString('ar-EG'); } catch { return s; } }
  function statusPill(status) {
    const cls = status === 'مكتمل' ? 'done' : status === 'ملغي' ? 'cancel' : status === 'جديد' ? 'new' : '';
    return `<span class="pill ${cls}">${status}</span>`;
  }

  // ================= SERVICES =================
  async function loadServices() {
    try {
      const rows = await api('/api/services?all=1');
      $('#servicesTable tbody').innerHTML = rows.map((s) => `
        <tr>
          <td>${s.image ? `<img class="thumb" src="${s.image}">` : ''}</td>
          <td><strong>${s.name}</strong><br><span style="color:var(--ink-muted); font-size:0.82rem;">${(s.description || '').slice(0, 60)}</span></td>
          <td>${s.group_name}</td>
          <td>${s.visible ? '<span class="pill done">ظاهرة</span>' : '<span class="pill cancel">مخفية</span>'}</td>
          <td class="row-actions">
            <button class="btn btn-outline btn-sm" data-edit="${s.id}">تعديل</button>
            <button class="btn btn-outline btn-sm" data-toggle="${s.id}" data-visible="${s.visible}">${s.visible ? 'إخفاء' : 'إظهار'}</button>
            <button class="btn btn-danger btn-sm" data-del="${s.id}">حذف</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="5" style="color:var(--ink-muted)">لا توجد خدمات بعد</td></tr>';

      $$('#servicesTable [data-edit]').forEach((b) => b.addEventListener('click', () => openServiceForm(rows.find((r) => r.id == b.dataset.edit))));
      $$('#servicesTable [data-toggle]').forEach((b) => b.addEventListener('click', async () => {
        try { await api(`/api/services/${b.dataset.toggle}`, { method: 'PATCH', body: JSON.stringify({ visible: b.dataset.visible === '0' ? 1 : 0 }) }); loadServices(); } catch (e) { showToast(e.message, true); }
      }));
      $$('#servicesTable [data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('هل تريد حذف هذه الخدمة؟')) return;
        try { await api(`/api/services/${b.dataset.del}`, { method: 'DELETE' }); showToast('تم حذف الخدمة'); loadServices(); } catch (e) { showToast(e.message, true); }
      }));
    } catch (e) { showToast(e.message, true); }
  }

  $('#addServiceBtn').addEventListener('click', () => openServiceForm(null));

  function openServiceForm(item) {
    const isEdit = !!item;
    openModal(`
      <h3>${isEdit ? 'تعديل خدمة' : 'إضافة خدمة'}</h3>
      <form id="serviceForm">
        <div class="field"><label>اسم الخدمة</label><input name="name" required value="${item?.name || ''}"></div>
        <div class="field"><label>المجموعة</label><input name="group_name" required value="${item?.group_name || ''}" placeholder="مثال: المونتاج"></div>
        <div class="field"><label>الوصف</label><textarea name="description" rows="3">${item?.description || ''}</textarea></div>
        <div class="field"><label>صورة الخدمة (اختياري)</label><input type="file" name="image_file" accept="image/*"></div>
        <div class="field"><label>الترتيب</label><input type="number" name="sort_order" value="${item?.sort_order ?? 0}"></div>
        <div class="error-text" id="svcErr"></div>
        <div style="display:flex; gap:10px; margin-top:8px;">
          <button type="submit" class="btn btn-primary">${isEdit ? 'حفظ التعديلات' : 'إضافة'}</button>
          <button type="button" class="btn btn-outline" id="cancelSvc">إلغاء</button>
        </div>
      </form>
    `);
    $('#cancelSvc').addEventListener('click', closeModal);
    $('#serviceForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const err = $('#svcErr');
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        let image = item?.image || '';
        const file = form.image_file.files[0];
        if (file) image = await uploadFile(file);
        const payload = { name: form.name.value.trim(), group_name: form.group_name.value.trim(), description: form.description.value.trim(), image, sort_order: Number(form.sort_order.value) || 0 };
        if (isEdit) await api(`/api/services/${item.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await api('/api/services', { method: 'POST', body: JSON.stringify(payload) });
        showToast(isEdit ? 'تم حفظ التعديلات' : 'تمت إضافة الخدمة');
        closeModal(); loadServices();
      } catch (e2) { err.textContent = e2.message; btn.disabled = false; }
    });
  }

  // ================= PORTFOLIO =================
  let categoriesCache = [];
  async function loadPortfolio() {
    try {
      if (!categoriesCache.length) categoriesCache = await api('/api/categories');
      const rows = await api('/api/portfolio?all=1');
      $('#portfolioTable tbody').innerHTML = rows.map((p) => `
        <tr>
          <td>${p.media_url ? (p.media_type === 'video' ? '🎬' : `<img class="thumb" src="${p.media_url}">`) : ''}</td>
          <td><strong>${p.title}</strong></td>
          <td>${p.category_slug}</td>
          <td>${p.visible ? '<span class="pill done">ظاهر</span>' : '<span class="pill cancel">مخفي</span>'}</td>
          <td class="row-actions">
            <button class="btn btn-outline btn-sm" data-edit="${p.id}">تعديل</button>
            <button class="btn btn-outline btn-sm" data-toggle="${p.id}" data-visible="${p.visible}">${p.visible ? 'إخفاء' : 'إظهار'}</button>
            <button class="btn btn-danger btn-sm" data-del="${p.id}">حذف</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="5" style="color:var(--ink-muted)">لا توجد مشاريع بعد</td></tr>';

      $$('#portfolioTable [data-edit]').forEach((b) => b.addEventListener('click', () => openPortfolioForm(rows.find((r) => r.id == b.dataset.edit))));
      $$('#portfolioTable [data-toggle]').forEach((b) => b.addEventListener('click', async () => {
        try { await api(`/api/portfolio/${b.dataset.toggle}`, { method: 'PATCH', body: JSON.stringify({ visible: b.dataset.visible === '0' ? 1 : 0 }) }); loadPortfolio(); } catch (e) { showToast(e.message, true); }
      }));
      $$('#portfolioTable [data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('هل تريد حذف هذا المشروع؟')) return;
        try { await api(`/api/portfolio/${b.dataset.del}`, { method: 'DELETE' }); showToast('تم الحذف'); loadPortfolio(); } catch (e) { showToast(e.message, true); }
      }));
    } catch (e) { showToast(e.message, true); }
  }

  $('#addPortfolioBtn').addEventListener('click', () => openPortfolioForm(null));

  function openPortfolioForm(item) {
    const isEdit = !!item;
    const catOptions = categoriesCache.filter((c) => c.slug !== 'all').map((c) => `<option value="${c.slug}" ${item?.category_slug === c.slug ? 'selected' : ''}>${c.name_ar}</option>`).join('');
    openModal(`
      <h3>${isEdit ? 'تعديل مشروع' : 'إضافة مشروع'}</h3>
      <form id="pfForm">
        <div class="field"><label>عنوان المشروع</label><input name="title" required value="${item?.title || ''}"></div>
        <div class="field"><label>الوصف</label><textarea name="description" rows="3">${item?.description || ''}</textarea></div>
        <div class="form-grid-2">
          <div class="field"><label>التصنيف</label><select name="category_slug">${catOptions}</select></div>
          <div class="field"><label>نوع الوسائط</label><select name="media_type"><option value="image" ${item?.media_type !== 'video' ? 'selected' : ''}>صورة</option><option value="video" ${item?.media_type === 'video' ? 'selected' : ''}>فيديو</option></select></div>
        </div>
        <div class="field"><label>رفع صورة أو فيديو</label><input type="file" name="media_file" accept="image/*,video/*"></div>
        <div class="field"><label>الترتيب</label><input type="number" name="sort_order" value="${item?.sort_order ?? 0}"></div>
        <div class="error-text" id="pfErr"></div>
        <div style="display:flex; gap:10px; margin-top:8px;">
          <button type="submit" class="btn btn-primary">${isEdit ? 'حفظ التعديلات' : 'إضافة'}</button>
          <button type="button" class="btn btn-outline" id="cancelPf">إلغاء</button>
        </div>
      </form>
    `);
    $('#cancelPf').addEventListener('click', closeModal);
    $('#pfForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = e.target;
      const err = $('#pfErr');
      const btn = form.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        let media_url = item?.media_url || '';
        const file = form.media_file.files[0];
        if (file) media_url = await uploadFile(file);
        const payload = { title: form.title.value.trim(), description: form.description.value.trim(), category_slug: form.category_slug.value, media_type: form.media_type.value, media_url, sort_order: Number(form.sort_order.value) || 0 };
        if (isEdit) await api(`/api/portfolio/${item.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        else await api('/api/portfolio', { method: 'POST', body: JSON.stringify(payload) });
        showToast(isEdit ? 'تم حفظ التعديلات' : 'تمت إضافة المشروع');
        closeModal(); loadPortfolio();
      } catch (e2) { err.textContent = e2.message; btn.disabled = false; }
    });
  }

  // ================= ORDERS =================
  const STATUSES = ['جديد', 'قيد المراجعة', 'قيد التنفيذ', 'مكتمل', 'ملغي'];
  async function loadOrders() {
    try {
      const rows = await api('/api/orders');
      $('#ordersTable tbody').innerHTML = rows.map((o) => `
        <tr>
          <td>${o.customer_name}<br><span style="color:var(--ink-muted); font-size:0.8rem;">${o.email || ''}</span></td>
          <td>${o.phone}</td>
          <td>${o.service_name || '-'}</td>
          <td>${o.budget || '-'}</td>
          <td>${o.attachment_url ? `<a href="${o.attachment_url}" target="_blank">عرض</a>` : '-'}</td>
          <td>${fmtDate(o.created_at)}</td>
          <td>
            <select data-status="${o.id}">${STATUSES.map((s) => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
          </td>
          <td class="row-actions"><button class="btn btn-danger btn-sm" data-del="${o.id}">حذف</button></td>
        </tr>`).join('') || '<tr><td colspan="8" style="color:var(--ink-muted)">لا توجد طلبات بعد</td></tr>';

      $$('#ordersTable [data-status]').forEach((sel) => sel.addEventListener('change', async () => {
        try { await api(`/api/orders/${sel.dataset.status}`, { method: 'PATCH', body: JSON.stringify({ status: sel.value }) }); showToast('تم تحديث حالة الطلب'); } catch (e) { showToast(e.message, true); }
      }));
      $$('#ordersTable [data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('هل تريد حذف هذا الطلب؟')) return;
        try { await api(`/api/orders/${b.dataset.del}`, { method: 'DELETE' }); showToast('تم الحذف'); loadOrders(); } catch (e) { showToast(e.message, true); }
      }));
    } catch (e) { showToast(e.message, true); }
  }

  // ================= MESSAGES =================
  async function loadMessages() {
    try {
      const rows = await api('/api/messages');
      $('#messagesTable tbody').innerHTML = rows.map((m) => `
        <tr style="${m.read ? '' : 'background:rgba(201,151,76,0.05)'}">
          <td>${m.name}${m.subject ? `<br><span style="color:var(--ink-muted); font-size:0.8rem;">${m.subject}</span>` : ''}</td>
          <td>${m.email || ''}${m.email && m.phone ? '<br>' : ''}${m.phone || ''}</td>
          <td style="max-width:320px;">${m.message}</td>
          <td>${fmtDate(m.created_at)}</td>
          <td class="row-actions">
            ${m.read ? '' : `<button class="btn btn-outline btn-sm" data-read="${m.id}">تمييز كمقروءة</button>`}
            <button class="btn btn-danger btn-sm" data-del="${m.id}">حذف</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="5" style="color:var(--ink-muted)">لا توجد رسائل بعد</td></tr>';

      $$('#messagesTable [data-read]').forEach((b) => b.addEventListener('click', async () => {
        try { await api(`/api/messages/${b.dataset.read}`, { method: 'PATCH', body: JSON.stringify({ read: 1 }) }); loadMessages(); } catch (e) { showToast(e.message, true); }
      }));
      $$('#messagesTable [data-del]').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('هل تريد حذف هذه الرسالة؟')) return;
        try { await api(`/api/messages/${b.dataset.del}`, { method: 'DELETE' }); loadMessages(); } catch (e) { showToast(e.message, true); }
      }));
    } catch (e) { showToast(e.message, true); }
  }

  // ================= SETTINGS =================
  const SETTINGS_FIELDS = [
    ['company_name_ar', 'اسم الشركة (عربي)'], ['company_name_en', 'اسم الشركة (إنجليزي)'],
    ['tagline', 'العنوان الرئيسي'], ['description', 'وصف الشركة'],
    ['phone', 'رقم الهاتف'], ['whatsapp', 'رقم واتساب (بدون رموز، مع كود الدولة)'],
    ['email', 'البريد الإلكتروني'], ['facebook', 'رابط فيسبوك'], ['instagram', 'رابط إنستغرام'],
    ['tiktok', 'رابط تيك توك'], ['youtube', 'رابط يوتيوب'], ['primary_color', 'اللون الأساسي (Hex)'],
  ];
  async function loadSettings() {
    try {
      const s = await api('/api/settings');
      $('#settingsForm').innerHTML = SETTINGS_FIELDS.map(([key, label]) => `
        <div class="field${key === 'description' || key === 'tagline' ? ' full' : ''}" style="${key === 'description' || key === 'tagline' ? 'grid-column:1/-1;' : ''}">
          <label>${label}</label>
          <input name="${key}" value="${(s[key] || '').replace(/"/g, '&quot;')}">
        </div>`).join('') + `
        <div class="field" style="grid-column:1/-1;">
          <label>شعار الموقع (Logo)</label>
          <input type="file" id="logoFile" accept="image/*">
          ${s.logo_url ? `<img src="${s.logo_url}" style="width:60px;height:60px;object-fit:cover;margin-top:8px;border:1px solid var(--line);">` : ''}
        </div>
        <div class="field" style="grid-column:1/-1;">
          <label>صورة الواجهة الرئيسية (Hero)</label>
          <input type="file" id="heroFile" accept="image/*">
          ${s.hero_image ? `<img src="${s.hero_image}" style="width:120px;height:150px;object-fit:cover;margin-top:8px;border:1px solid var(--line);">` : '<span class="hint">لا توجد صورة حاليًا — سيظهر التصميم الافتراضي</span>'}
        </div>`;
    } catch (e) { showToast(e.message, true); }
  }
  $('#saveSettingsBtn').addEventListener('click', async () => {
    try {
      const form = $('#settingsForm');
      const payload = {};
      SETTINGS_FIELDS.forEach(([key]) => { payload[key] = form.elements[key]?.value ?? ''; });
      const logoFile = $('#logoFile')?.files[0];
      if (logoFile) payload.logo_url = await uploadFile(logoFile);
      const heroFile = $('#heroFile')?.files[0];
      if (heroFile) payload.hero_image = await uploadFile(heroFile);
      await api('/api/settings', { method: 'PUT', body: JSON.stringify(payload) });
      showToast('تم حفظ الإعدادات بنجاح');
      loadSettings();
    } catch (e) { showToast(e.message, true); }
  });

  // ---------- boot ----------
  showSection('overview');
})();
