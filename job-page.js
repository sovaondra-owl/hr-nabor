(function () {
  const cardsEl = document.getElementById('job-cards');
  const applySection = document.getElementById('job-apply');
  const successSection = document.getElementById('job-success');
  const positionsSection = document.getElementById('job-positions');
  const applyPositionNameEl = document.getElementById('apply-position-name');
  const applicationPositionIdEl = document.getElementById('application-position-id');
  const applicationOpeningIdEl = document.getElementById('application-opening-id');
  const form = document.getElementById('application-form');
  const MIN_SUBMIT_SECONDS = 15;
  let formShownAt = 0;

  async function loadOpeningsPublic() {
    await openDB();
    const allOpenings = (await getAllOpenings()).filter(o => o.status === 'aktivni');
    const allPositions = await getAllPositions();
    if (allOpenings.length === 0) {
      cardsEl.innerHTML = '<p class="empty">Momentálně nemáme vypsané otevřené pozice. Zkuste to později nebo nás kontaktujte.</p>';
      return;
    }

    const params = new URLSearchParams(window.location.search || '');
    const slug = params.get('job');

    if (slug) {
      const opening = allOpenings.find(o => o.publicSlug === slug || o.id === slug);
      if (!opening) {
        cardsEl.innerHTML = '<p class="empty">Toto výběrové řízení nebylo nalezeno nebo již není aktivní.</p>';
        return;
      }
      const pos = allPositions.find(p => p.id === opening.positionId);
      positionsSection.hidden = true;
      successSection.hidden = true;
      applySection.hidden = false;
      formShownAt = Date.now();
      applyPositionNameEl.textContent = opening.title || (pos ? pos.name : '');
      applicationPositionIdEl.value = opening.positionId || '';
      applicationOpeningIdEl.value = opening.id;
      form.reset();
      applicationPositionIdEl.value = opening.positionId || '';
      applicationOpeningIdEl.value = opening.id;
      updateDropzoneLabels();
      return;
    }

    cardsEl.innerHTML = allOpenings.map(o => {
      const pos = allPositions.find(p => p.id === o.positionId);
      const name = o.title || (pos ? pos.name : 'Pozice');
      const location = o.location || '';
      return `
      <div class="job-card bg-white rounded-2xl p-6 shadow-sm border border-slate-100 hover:shadow-md hover:border-cyan-100 transition-all" data-opening-id="${o.id}" data-position-id="${o.positionId || ''}" data-name="${escapeAttr(name)}">
        <h3 class="text-lg font-bold text-blue-950 mb-1">${escapeHtml(name)}</h3>
        <p class="text-sm text-slate-500 mb-3">${escapeHtml(pos ? pos.name : '')}${location ? ' · ' + escapeHtml(location) : ''}</p>
        ${o.description ? `<p class="text-sm text-slate-600 mb-4 line-clamp-2">${escapeHtml(o.description)}</p>` : ''}
        <button type="button" class="btn-apply-job px-5 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-700 text-white font-semibold rounded-xl shadow-[0_4px_14px_0_rgba(6,182,212,0.3)] transition-all">Přihlásit se</button>
      </div>
    `;
    }).join('');

    cardsEl.querySelectorAll('.job-card').forEach(card => {
      card.querySelector('.btn-apply-job').addEventListener('click', () => {
        showApplyForm(card.dataset.openingId, card.dataset.positionId, card.dataset.name);
      });
    });
  }

  function showApplyForm(openingId, positionId, positionName) {
    positionsSection.hidden = true;
    successSection.hidden = true;
    applySection.hidden = false;
    formShownAt = Date.now();
    applyPositionNameEl.textContent = positionName;
    applicationPositionIdEl.value = positionId || '';
    applicationOpeningIdEl.value = openingId || '';
    form.reset();
    applicationPositionIdEl.value = positionId || '';
    applicationOpeningIdEl.value = openingId || '';
    updateDropzoneLabels();
  }

  document.getElementById('btn-back-positions').addEventListener('click', () => {
    applySection.hidden = true;
    successSection.hidden = true;
    positionsSection.hidden = false;
  });

  const DROPZONE_DEFAULTS = { 'app-cv': 'Klikněte nebo přetáhněte soubor' };
  function updateDropzoneLabels() {
    document.querySelectorAll('.job-dropzone').forEach(zone => {
      const forId = zone.getAttribute('data-for');
      const input = document.getElementById(forId);
      const textEl = zone.querySelector('.job-dropzone-text');
      if (!input || !textEl) return;
      if (input.multiple && input.files && input.files.length > 0) {
        textEl.textContent = input.files.length === 1 ? input.files[0].name : input.files.length + ' souborů';
      } else if (!input.multiple && input.files && input.files[0]) {
        textEl.textContent = input.files[0].name;
      } else {
        textEl.textContent = DROPZONE_DEFAULTS[forId] || 'Klikněte nebo přetáhněte';
      }
    });
  }

  document.querySelectorAll('.job-dropzone').forEach(zone => {
    const forId = zone.getAttribute('data-for');
    const input = document.getElementById(forId);
    if (!input) return;
    zone.addEventListener('click', (e) => { if (!e.target.closest('input')) input.click(); });
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('bg-cyan-50/80', 'border-cyan-400'); });
    zone.addEventListener('dragleave', () => { zone.classList.remove('bg-cyan-50/80', 'border-cyan-400'); });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('bg-cyan-50/80', 'border-cyan-400');
      if (e.dataTransfer.files && e.dataTransfer.files.length) {
        input.files = e.dataTransfer.files;
        updateDropzoneLabels();
      }
    });
    input.addEventListener('change', updateDropzoneLabels);
  });

  function escapeHtml(s) {
    if (s == null) return '';
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }
  function escapeAttr(s) {
    if (s == null) return '';
    return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result.split(',')[1];
        resolve({ name: file.name, type: file.type, size: file.size, data: base64 });
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const gdprCheck = document.getElementById('app-gdpr-consent');
    if (!gdprCheck || !gdprCheck.checked) {
      alert('Pro odeslání přihlášky je nutné souhlasit se zpracováním osobních údajů.');
      return;
    }
    const elapsed = formShownAt ? Date.now() - formShownAt : 0;
    const minMs = MIN_SUBMIT_SECONDS * 1000;
    if (formShownAt && elapsed < minMs) {
      const left = Math.ceil((minMs - elapsed) / 1000);
      alert('Prosím vyplňte formulář důkladně. Odeslat jej můžete za ' + left + ' sekund.');
      return;
    }
    const linkedin = (document.getElementById('app-linkedin').value || '').trim();
    const cvInput = document.getElementById('app-cv');
    const hasCv = cvInput.files && cvInput.files[0];
    if (!hasCv && !linkedin) {
      alert('Nahrajte životopis (CV) nebo vyplňte odkaz na LinkedIn profil.');
      return;
    }

    const positionId = applicationPositionIdEl.value;
    const files = [];
    if (cvInput.files && cvInput.files[0]) {
      files.push(await readFileAsBase64(cvInput.files[0]));
    }

    const startDateEl = document.getElementById('app-start-date');
    const startDate = startDateEl && startDateEl.value ? startDateEl.value.trim() : '';

    const application = {
      positionId,
      openingId: applicationOpeningIdEl.value || null,
      surname: document.getElementById('app-surname').value.trim(),
      firstname: document.getElementById('app-firstname').value.trim(),
      email: document.getElementById('app-email').value.trim(),
      phone: document.getElementById('app-phone').value.trim(),
      linkedin: document.getElementById('app-linkedin').value.trim(),
      startDate: startDate || null,
      message: document.getElementById('app-message').value.trim(),
      files
    };

    await saveApplication(application);
    applySection.hidden = true;
    positionsSection.hidden = false;
    successSection.hidden = false;
  });

  loadOpeningsPublic();
})();
