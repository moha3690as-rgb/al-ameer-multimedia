(() => {
  'use strict';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  document.getElementById('year').textContent = new Date().getFullYear();

  // ---------- nav toggle ----------
  const navToggle = $('#navToggle');
  const navLinks = $('#navLinks');
  navToggle.addEventListener('click', () => navLinks.classList.toggle('open'));
  $$('#navLinks a').forEach((a) => a.addEventListener('click', () => navLinks.classList.remove('open')));

  // ---------- settings ----------
  let uploadedAttachmentUrl = '';

  fetch('/api/settings').then((r) => r.json()).then((s) => {
    $$('[data-bind]').forEach((el) => {
      const key = el.dataset.bind;
      if (s[key]) el.textContent = s[key];
    });
    if (s.logo_url) $$('img.brand-mark, link[rel="icon"], link[rel="apple-touch-icon"]').forEach((el) => {
      if (el.tagName === 'IMG') el.src = s.logo_url; else el.href = s.logo_url;
    });
    if (s.hero_image) {
      const heroImg = $('#heroImage');
      heroImg.src = s.hero_image;
      heroImg.style.display = 'block';
    }

    const infoList = $('#contactInfoList');
    const footerContact = $('#footerContact');
    const items = [
      ['هاتف', s.phone, s.phone ? `tel:${s.phone}` : null],
      ['واتساب', s.whatsapp, s.whatsapp ? `https://wa.me/${s.whatsapp.replace(/\D/g, '')}` : null],
      ['بريد إلكتروني', s.email, s.email ? `mailto:${s.email}` : null],
    ];
    items.forEach(([label, value, href]) => {
      if (!value) return;
      const div = document.createElement('div');
      div.className = 'contact-info-item';
      div.innerHTML = `<span class="icon">•</span><span>${label}: ${href ? `<a href="${href}">${value}</a>` : value}</span>`;
      infoList.appendChild(div);
      const li = document.createElement('li');
      li.innerHTML = href ? `<a href="${href}">${value}</a>` : value;
      footerContact.appendChild(li);
    });

    const socials = [
      ['facebook', s.facebook], ['instagram', s.instagram], ['tiktok', s.tiktok], ['youtube', s.youtube],
    ];
    const socialRow = $('#socialRow');
    socials.forEach(([name, link]) => {
      if (!link) return;
      const a = document.createElement('a');
      a.href = link; a.target = '_blank'; a.rel = 'noopener'; a.textContent = name[0].toUpperCase();
      socialRow.appendChild(a);
    });

    if (s.whatsapp) {
      const wa = $('#whatsappFloat');
      wa.href = `https://wa.me/${s.whatsapp.replace(/\D/g, '')}`;
      wa.style.display = 'flex';
    }
  }).catch(() => {});

  // ---------- services ----------
  fetch('/api/services').then((r) => r.json()).then((services) => {
    const groups = {};
    services.forEach((s) => {
      groups[s.group_name] = groups[s.group_name] || [];
      groups[s.group_name].push(s);
    });
    const container = $('#servicesContainer');
    const selectEl = $('#o_service');
    Object.entries(groups).forEach(([groupName, items]) => {
      const row = document.createElement('div');
      row.className = 'service-group';
      row.innerHTML = `
        <div class="service-group-title">${groupName}</div>
        <div class="service-items">
          ${items.map((it) => `
            <div class="service-item">
              <h4>${it.name}</h4>
              <p>${it.description || ''}</p>
              <a class="request-link" href="#order" data-service="${it.name}">اطلب الخدمة</a>
            </div>
          `).join('')}
        </div>`;
      container.appendChild(row);
      items.forEach((it) => {
        const opt = document.createElement('option');
        opt.value = it.name; opt.textContent = it.name;
        selectEl.appendChild(opt);
      });
    });
    $$('.request-link').forEach((a) => a.addEventListener('click', () => {
      $('#o_service').value = a.dataset.service;
    }));
  }).catch(() => {});

  // ---------- portfolio ----------
  let currentCategory = 'all';
  function loadPortfolio(category) {
    const url = category && category !== 'all' ? `/api/portfolio?category=${encodeURIComponent(category)}` : '/api/portfolio';
    fetch(url).then((r) => r.json()).then((items) => {
      const grid = $('#portfolioGrid');
      grid.innerHTML = items.map((p) => `
        <div class="portfolio-card" data-id="${p.id}">
          <img src="${p.media_url || placeholderImg(p.title)}" alt="${p.title}" loading="lazy">
          <div class="p-info"><h4>${p.title}</h4><span>${p.category_slug}</span></div>
        </div>`).join('') || '<p style="color:var(--ink-muted);">سيتم إضافة الأعمال قريبًا.</p>';
      $$('.portfolio-card', grid).forEach((card) => {
        card.addEventListener('click', () => {
          const item = items.find((p) => String(p.id) === card.dataset.id);
          openModal(item);
        });
      });
    }).catch(() => {});
  }

  function placeholderImg(title) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='400' height='500'><rect width='100%' height='100%' fill='%23221c15'/><text x='50%' y='50%' fill='%23C9974C' font-size='20' text-anchor='middle' font-family='sans-serif'>${title.slice(0, 18)}</text></svg>`;
    return `data:image/svg+xml,${svg}`;
  }

  fetch('/api/categories').then((r) => r.json()).then((cats) => {
    const row = $('#filterRow');
    row.innerHTML = cats.map((c, i) => `<button class="filter-chip ${i === 0 ? 'active' : ''}" data-slug="${c.slug}">${c.name_ar}</button>`).join('');
    $$('.filter-chip', row).forEach((btn) => btn.addEventListener('click', () => {
      $$('.filter-chip', row).forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.slug;
      loadPortfolio(currentCategory);
    }));
  }).catch(() => {});
  loadPortfolio('all');

  // ---------- modal ----------
  const overlay = $('#modalOverlay');
  function openModal(item) {
    if (!item) return;
    $('#modalTitle').textContent = item.title;
    $('#modalDesc').textContent = item.description || '';
    const media = $('#modalMedia');
    media.innerHTML = item.media_type === 'video' && item.media_url
      ? `<video src="${item.media_url}" controls></video>`
      : `<img src="${item.media_url || placeholderImg(item.title)}" alt="${item.title}">`;
    overlay.classList.add('open');
  }
  $('#modalClose').addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
  $('#modalOrderBtn').addEventListener('click', () => overlay.classList.remove('open'));

  // ---------- order form file upload ----------
  const fileDrop = $('#fileDrop');
  const fileInput = $('#fileInput');
  fileDrop.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileDrop.textContent = 'جارِ رفع الملف...';
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await fetch('/api/upload/public', { method: 'POST', body: fd });
      const data = await res.json();
      if (res.ok) {
        uploadedAttachmentUrl = data.url;
        fileDrop.textContent = `تم إرفاق: ${file.name}`;
        fileDrop.classList.add('has-file');
      } else {
        fileDrop.textContent = data.error || 'فشل رفع الملف — اضغط للمحاولة مجددًا';
      }
    } catch {
      fileDrop.textContent = 'تعذر رفع الملف — اضغط للمحاولة مجددًا';
    }
  });

  // ---------- order form submit ----------
  $('#orderForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = $('#orderMsg');
    const payload = {
      customer_name: form.customer_name.value.trim(),
      phone: form.phone.value.trim(),
      email: form.email.value.trim(),
      service_name: form.service_name.value,
      details: form.details.value.trim(),
      budget: form.budget.value.trim(),
      needed_date: form.needed_date.value,
      attachment_url: uploadedAttachmentUrl,
    };
    try {
      const res = await fetch('/api/orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      msg.className = 'form-msg ' + (res.ok ? 'ok' : 'err');
      msg.textContent = res.ok ? data.message : (data.error || 'حدث خطأ، حاول مرة أخرى.');
      if (res.ok) { form.reset(); fileDrop.textContent = 'اضغط لاختيار ملف أو اسحبه هنا'; fileDrop.classList.remove('has-file'); uploadedAttachmentUrl = ''; }
    } catch {
      msg.className = 'form-msg err';
      msg.textContent = 'تعذر إرسال الطلب، تحقق من الاتصال وحاول مرة أخرى.';
    }
  });

  // ---------- contact form submit ----------
  $('#contactForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const msg = $('#contactMsg');
    const payload = {
      name: form.name.value.trim(), phone: form.phone.value.trim(),
      email: form.email.value.trim(), subject: form.subject.value.trim(), message: form.message.value.trim(),
    };
    try {
      const res = await fetch('/api/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await res.json();
      msg.className = 'form-msg ' + (res.ok ? 'ok' : 'err');
      msg.textContent = res.ok ? data.message : (data.error || 'حدث خطأ، حاول مرة أخرى.');
      if (res.ok) form.reset();
    } catch {
      msg.className = 'form-msg err';
      msg.textContent = 'تعذر إرسال الرسالة، تحقق من الاتصال وحاول مرة أخرى.';
    }
  });

  // ---------- PWA install ----------
  let deferredPrompt = null;
  const banner = $('#install-banner');
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (!sessionStorage.getItem('install-dismissed')) banner.classList.add('show');
  });
  $('#installBtn').addEventListener('click', async () => {
    banner.classList.remove('show');
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  });
  $('#dismissInstall').addEventListener('click', () => {
    banner.classList.remove('show');
    sessionStorage.setItem('install-dismissed', '1');
  });
  window.addEventListener('appinstalled', () => banner.classList.remove('show'));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
})();
