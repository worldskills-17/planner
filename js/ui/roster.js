/**
 * Expert Roster page — import CSV, view/edit/sort/filter experts.
 * Inline editing of skills (star ratings), preferences, notes, and all fields.
 */
import store from '../data/store.js';
import { importExpertsFromFile } from '../data/importer.js';
import { flagImg, skillBadge, editableStarRating, showToast, showModal } from './components.js';
import { PREF_OPTIONS, PREF_LABELS as PREF_DISPLAY, PREF_CLASS, isObserverOnly } from '../shared.js';

let sortCol = 'cc';
let sortDir = 'asc';
let filterText = '';
let _unsubscribe = null;

export function render(container) {
  // Clean up previous subscription to prevent stale subscriber accumulation
  if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }

  container.innerHTML = `
    <div class="p-6 max-w-[1400px] mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Expert Roster</h1>
        <div class="flex items-center gap-3">
          <label class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium cursor-pointer hover:bg-blue-700 transition-colors">
            Import CSV
            <input type="file" id="csv-import" accept=".csv" class="hidden" aria-label="Import expert CSV file" />
          </label>
          <button id="btn-add-expert" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors">+ Add Expert</button>
          <span id="expert-count" class="text-sm text-gray-500"></span>
        </div>
      </div>

      <div class="mb-4">
        <label for="roster-filter" class="sr-only">Filter experts</label>
        <input type="text" id="roster-filter" placeholder="Filter by name, country, or code..."
          class="w-full max-w-md px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      <div id="roster-summary" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4"></div>

      <div class="overflow-x-auto bg-white rounded-xl shadow border border-gray-200">
        <table class="w-full text-sm">
          <thead id="roster-thead" class="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"></thead>
          <tbody id="roster-tbody" class="divide-y divide-gray-100"></tbody>
        </table>
      </div>

      <div id="csv-format-help" class="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
        <p class="font-medium mb-1">CSV Format</p>
        <code class="text-xs block bg-white p-2 rounded border">CC,Name,Member,Notes,DI,FE,BE,New,DI_Pref,FE_Pref,BE_Pref</code>
        <p class="mt-1 text-xs">Skills: 0-5 | Preferences: Y/N/M/Observer | New: Y/N</p>
      </div>
    </div>`;

  container.querySelector('#csv-import').addEventListener('change', handleCSVImport);
  container.querySelector('#roster-filter').addEventListener('input', (e) => {
    filterText = e.target.value.toLowerCase();
    renderTable(container);
  });
  container.querySelector('#btn-add-expert').addEventListener('click', () => showAddExpertRow(container));

  // Use event delegation on the table — survives tbody rebuilds
  const tableEl = container.querySelector('table');
  tableEl.addEventListener('click', (e) => {
    // Star rating clicks
    const star = e.target.closest('.star-btn');
    if (star) {
      const { expertId, skill, value } = star.dataset;
      updateExpertField(expertId, `skills.${skill}`, parseInt(value));
      return;
    }
    // New toggle
    const toggleBtn = e.target.closest('.toggle-new');
    if (toggleBtn) {
      const expert = store.state.experts.find(ex => ex.id === toggleBtn.dataset.expertId);
      if (expert) updateExpertField(toggleBtn.dataset.expertId, 'is_new', !expert.is_new);
      return;
    }
    // Delete
    const delBtn = e.target.closest('.btn-delete-expert');
    if (delBtn) {
      deleteExpert(delBtn.dataset.expertId);
      return;
    }
  });
  tableEl.addEventListener('change', (e) => {
    // Preference dropdowns
    const select = e.target.closest('.edit-pref');
    if (select) {
      const allClasses = Object.values(PREF_CLASS).join(' ').split(' ');
      select.classList.remove(...allClasses);
      const newCls = PREF_CLASS[select.value] || PREF_CLASS.M;
      select.classList.add(...newCls.split(' '));
      updateExpertField(select.dataset.expertId, `preferences.${select.dataset.skill}`, select.value);
      return;
    }
    // Name and notes
    const input = e.target.closest('.edit-name, .edit-notes');
    if (input) {
      updateExpertField(input.dataset.expertId, input.dataset.field, input.value.trim());
      return;
    }
  });

  _unsubscribe = store.subscribe('experts', () => renderTable(container));
  renderTable(container);
}

async function handleCSVImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const experts = await importExpertsFromFile(file);
    showToast(`Imported ${experts.length} experts`, 'success');
  } catch (err) {
    showToast(`Import failed: ${err.message}`, 'error', 5000);
  }
  e.target.value = '';
}

function updateExpertField(expertId, path, value) {
  const experts = store.state.experts.map(e => {
    if (e.id !== expertId) return e;
    const updated = { ...e };
    if (path.includes('.')) {
      const [group, key] = path.split('.');
      updated[group] = { ...updated[group], [key]: value };
    } else {
      updated[path] = value;
    }
    // Recalculate derived fields
    updated.avg_skill = ((updated.skills.di + updated.skills.fe + updated.skills.be) / 3).toFixed(1);
    updated.is_observer_only = isObserverOnly(updated);
    return updated;
  });
  store.setExperts(experts);
}

function deleteExpert(expertId) {
  const experts = store.state.experts.filter(e => e.id !== expertId);
  store.setExperts(experts);
  showToast('Expert removed', 'info');
}

function showAddExpertRow() {
  // State for the modal's interactive star ratings — 0 = not selected
  const modalSkills = { di: 0, fe: 0, be: 0 };

  const html = `
    <div class="space-y-5">
      <!-- Country code + Name row -->
      <div class="grid grid-cols-5 gap-4">
        <div class="col-span-1">
          <label class="block text-xs font-medium text-gray-500 mb-1">Country Code <span class="text-red-400">*</span></label>
          <input type="text" id="new-cc" maxlength="3" placeholder="UK"
            class="w-full px-3 py-2 border rounded-lg text-sm font-mono font-bold text-center uppercase tracking-wider focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          <div class="flex justify-center mt-2">
            <div id="new-flag-preview" class="w-10 h-7 rounded border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden">
              <span class="text-gray-300 text-xs">?</span>
            </div>
          </div>
        </div>
        <div class="col-span-4">
          <label class="block text-xs font-medium text-gray-500 mb-1">Full Name <span class="text-red-400">*</span></label>
          <input type="text" id="new-name" placeholder="e.g. Val Adamescu"
            class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          <div class="mt-2">
            <label class="block text-xs font-medium text-gray-500 mb-1">Member Country / Region</label>
            <input type="text" id="new-member" placeholder="e.g. United Kingdom"
              class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
          </div>
        </div>
      </div>

      <!-- Skills with interactive stars -->
      <div>
        <label class="block text-xs font-medium text-gray-500 mb-2">Skill Levels <span class="text-red-400">*</span></label>
        <div class="grid grid-cols-3 gap-4">
          <div id="new-skill-card-di" class="bg-violet-50 rounded-lg p-3 text-center border border-violet-200">
            <div class="text-xs font-semibold text-violet-700 mb-1.5">Design Implementation</div>
            <div id="new-stars-di" class="flex justify-center gap-1">${modalStars('di', 0)}</div>
            <div class="text-xs text-gray-400 mt-1 skill-hint" data-skill="di">Select a level</div>
          </div>
          <div id="new-skill-card-fe" class="bg-sky-50 rounded-lg p-3 text-center border border-sky-200">
            <div class="text-xs font-semibold text-sky-700 mb-1.5">Frontend</div>
            <div id="new-stars-fe" class="flex justify-center gap-1">${modalStars('fe', 0)}</div>
            <div class="text-xs text-gray-400 mt-1 skill-hint" data-skill="fe">Select a level</div>
          </div>
          <div id="new-skill-card-be" class="bg-amber-50 rounded-lg p-3 text-center border border-amber-200">
            <div class="text-xs font-semibold text-amber-700 mb-1.5">Backend</div>
            <div id="new-stars-be" class="flex justify-center gap-1">${modalStars('be', 0)}</div>
            <div class="text-xs text-gray-400 mt-1 skill-hint" data-skill="be">Select a level</div>
          </div>
        </div>
      </div>

      <!-- Preferences -->
      <div>
        <label class="block text-xs font-medium text-gray-500 mb-2">Marking Preferences <span class="text-red-400">*</span></label>
        <div class="grid grid-cols-3 gap-4">
          <div>
            <label class="block text-xs text-gray-400 mb-1">Design Implementation</label>
            <select id="new-pref-di" class="w-full px-3 py-2 border rounded-lg text-sm text-gray-400">
              <option value="" selected disabled>Select...</option>
              <option value="Y">Yes</option><option value="M">Maybe</option><option value="N">No</option><option value="Observer">Observer</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Frontend</label>
            <select id="new-pref-fe" class="w-full px-3 py-2 border rounded-lg text-sm text-gray-400">
              <option value="" selected disabled>Select...</option>
              <option value="Y">Yes</option><option value="M">Maybe</option><option value="N">No</option><option value="Observer">Observer</option>
            </select>
          </div>
          <div>
            <label class="block text-xs text-gray-400 mb-1">Backend</label>
            <select id="new-pref-be" class="w-full px-3 py-2 border rounded-lg text-sm text-gray-400">
              <option value="" selected disabled>Select...</option>
              <option value="Y">Yes</option><option value="M">Maybe</option><option value="N">No</option><option value="Observer">Observer</option>
            </select>
          </div>
        </div>
      </div>

      <!-- New + Notes row -->
      <div class="grid grid-cols-4 gap-4">
        <div>
          <label class="block text-xs font-medium text-gray-500 mb-1">First-time Expert?</label>
          <label class="flex items-center gap-2 px-3 py-2 border rounded-lg cursor-pointer hover:bg-gray-50">
            <input type="checkbox" id="new-is-new" class="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            <span class="text-sm">New</span>
          </label>
        </div>
        <div class="col-span-3">
          <label class="block text-xs font-medium text-gray-500 mb-1">Notes</label>
          <input type="text" id="new-notes" placeholder="Any special notes..."
            class="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none" />
        </div>
      </div>

      <!-- Validation message -->
      <div id="new-expert-error" class="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 hidden"></div>
    </div>`;

  const modal = showModal('Add New Expert', html, {
    confirmText: 'Add Expert',
    onConfirm: () => {
      const errorEl = modal.querySelector('#new-expert-error');
      const errors = [];

      const cc = document.getElementById('new-cc').value.trim().toUpperCase();
      const name = document.getElementById('new-name').value.trim();
      const member = document.getElementById('new-member').value.trim();
      const notes = document.getElementById('new-notes').value.trim();
      const isNew = document.getElementById('new-is-new').checked;
      const prefDI = document.getElementById('new-pref-di').value;
      const prefFE = document.getElementById('new-pref-fe').value;
      const prefBE = document.getElementById('new-pref-be').value;

      if (!cc || cc.length < 2) errors.push('Country code is required (at least 2 characters)');
      if (!name) errors.push('Expert name is required');
      if (cc && store.state.experts.find(e => e.id === cc)) errors.push(`Expert with code ${cc} already exists`);
      if (modalSkills.di === 0) errors.push('Design Implementation skill level is required');
      if (modalSkills.fe === 0) errors.push('Frontend skill level is required');
      if (modalSkills.be === 0) errors.push('Backend skill level is required');
      if (!prefDI) errors.push('Design Implementation preference is required');
      if (!prefFE) errors.push('Frontend preference is required');
      if (!prefBE) errors.push('Backend preference is required');

      if (errors.length > 0) {
        errorEl.innerHTML = errors.map(e => `&bull; ${e}`).join('<br>');
        errorEl.classList.remove('hidden');
        return false;
      }

      const expert = {
        id: cc, country_code: cc, name, member_country: member, notes,
        skills: { di: modalSkills.di, fe: modalSkills.fe, be: modalSkills.be },
        preferences: { di: prefDI, fe: prefFE, be: prefBE },
        is_new: isNew,
        is_observer_only: isObserverOnly({ preferences: { di: prefDI, fe: prefFE, be: prefBE } }),
        supervisor_willing: 'M',
        avg_skill: ((modalSkills.di + modalSkills.fe + modalSkills.be) / 3).toFixed(1),
      };

      const experts = [...store.state.experts, expert];
      store.setExperts(experts);
      showToast(`${name} (${cc}) added`, 'success');
    },
  });

  // Wire up live flag preview on CC input
  const ccInput = modal.querySelector('#new-cc');
  const flagPreview = modal.querySelector('#new-flag-preview');
  ccInput.addEventListener('input', () => {
    const val = ccInput.value.trim().toUpperCase();
    if (val.length >= 2) {
      flagPreview.innerHTML = `<img src="img/flags/${val}.svg" alt="${val}" class="w-full h-full object-cover" onerror="this.parentElement.innerHTML='<span class=\\'text-gray-300 text-xs\\'>?</span>'" />`;
    } else {
      flagPreview.innerHTML = '<span class="text-gray-300 text-xs">?</span>';
    }
  });

  // Make preference selects turn normal colour once selected
  modal.querySelectorAll('#new-pref-di, #new-pref-fe, #new-pref-be').forEach(sel => {
    sel.addEventListener('change', () => {
      sel.classList.remove('text-gray-400');
      sel.classList.add('text-gray-900');
    });
  });

  // Wire up interactive star ratings in modal
  wireModalStars(modal, modalSkills);

  // Focus CC field
  setTimeout(() => ccInput.focus(), 100);
}

function wireModalStars(modal, modalSkills) {
  modal.querySelectorAll('.modal-star').forEach(star => {
    star.addEventListener('click', () => {
      const skill = star.dataset.skill;
      const value = parseInt(star.dataset.value);
      modalSkills[skill] = value;
      // Re-render that skill's stars
      const container = modal.querySelector(`#new-stars-${skill}`);
      if (container) container.innerHTML = modalStars(skill, value);
      // Update hint
      const hint = modal.querySelector(`.skill-hint[data-skill="${skill}"]`);
      if (hint) hint.textContent = `Level ${value}/5`;
      // Re-wire after re-render
      wireModalStars(modal, modalSkills);
    });
  });
}

function modalStars(skill, current) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    const filled = i <= current;
    html += `<span class="modal-star cursor-pointer text-2xl leading-none select-none transition-transform hover:scale-125 ${filled ? 'text-amber-400' : 'text-gray-300'}"
      data-skill="${skill}" data-value="${i}">&#9733;</span>`;
  }
  return html;
}

function renderTable(container) {
  const experts = store.state.experts;
  const thead = container.querySelector('#roster-thead');
  const tbody = container.querySelector('#roster-tbody');
  const countEl = container.querySelector('#expert-count');
  const summaryEl = container.querySelector('#roster-summary');

  if (!thead || !tbody) return;

  // Summary
  if (experts.length > 0) {
    const avgDI = (experts.reduce((s, e) => s + e.skills.di, 0) / experts.length).toFixed(1);
    const avgFE = (experts.reduce((s, e) => s + e.skills.fe, 0) / experts.length).toFixed(1);
    const avgBE = (experts.reduce((s, e) => s + e.skills.be, 0) / experts.length).toFixed(1);
    const newCount = experts.filter(e => e.is_new).length;
    const obsCount = experts.filter(e => e.is_observer_only).length;

    summaryEl.innerHTML = `
      <div class="bg-white rounded-lg border p-3 text-center">
        <div class="text-2xl font-bold">${experts.length}</div>
        <div class="text-xs text-gray-500">Total Experts</div>
      </div>
      <div class="bg-white rounded-lg border p-3 text-center">
        <div class="text-lg font-bold">DI ${avgDI} / FE ${avgFE} / BE ${avgBE}</div>
        <div class="text-xs text-gray-500">Average Skills</div>
      </div>
      <div class="bg-white rounded-lg border p-3 text-center">
        <div class="text-2xl font-bold">${newCount}</div>
        <div class="text-xs text-gray-500">New Experts</div>
      </div>
      <div class="bg-white rounded-lg border p-3 text-center">
        <div class="text-2xl font-bold">${obsCount}</div>
        <div class="text-xs text-gray-500">Observers</div>
      </div>`;
  } else {
    summaryEl.innerHTML = '';
  }

  countEl.textContent = experts.length > 0 ? `${experts.length} experts` : '';

  const columns = [
    { key: 'cc', label: 'CC', sortField: e => e.country_code },
    { key: 'name', label: 'Name', sortField: e => e.name },
    { key: 'member', label: 'Country', sortField: e => e.member_country },
    { key: 'di', label: 'Design Impl.', sortField: e => e.skills.di },
    { key: 'fe', label: 'Frontend', sortField: e => e.skills.fe },
    { key: 'be', label: 'Backend', sortField: e => e.skills.be },
    { key: 'new', label: 'New', sortField: e => e.is_new ? 1 : 0 },
    { key: 'di_pref', label: 'DI Pref', sortField: e => e.preferences.di },
    { key: 'fe_pref', label: 'FE Pref', sortField: e => e.preferences.fe },
    { key: 'be_pref', label: 'BE Pref', sortField: e => e.preferences.be },
    { key: 'notes', label: 'Notes', sortField: e => e.notes },
    { key: 'actions', label: '', sortField: null },
  ];

  // Header
  thead.innerHTML = `<tr>${columns.map(col => {
    if (!col.sortField) return `<th scope="col" class="px-3 py-3 whitespace-nowrap">${col.label || '<span class="sr-only">Actions</span>'}</th>`;
    const arrow = sortCol === col.key ? (sortDir === 'asc' ? ' &#9650;' : ' &#9660;') : '';
    return `<th scope="col" class="px-3 py-3 cursor-pointer hover:bg-gray-100 whitespace-nowrap select-none" data-sort="${col.key}">${col.label}${arrow}</th>`;
  }).join('')}</tr>`;

  thead.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortCol === key) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortCol = key;
        sortDir = 'asc';
      }
      renderTable(container);
    });
  });

  // Filter
  let filtered = experts;
  if (filterText) {
    filtered = experts.filter(e =>
      e.country_code.toLowerCase().includes(filterText) ||
      e.name.toLowerCase().includes(filterText) ||
      e.member_country.toLowerCase().includes(filterText) ||
      (e.notes || '').toLowerCase().includes(filterText)
    );
  }

  // Sort
  const col = columns.find(c => c.key === sortCol);
  if (col && col.sortField) {
    filtered = [...filtered].sort((a, b) => {
      let va = col.sortField(a);
      let vb = col.sortField(b);
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  // Rows
  tbody.innerHTML = filtered.map(expert => renderExpertRow(expert)).join('');

  // Hide format help when experts loaded
  const helpEl = container.querySelector('#csv-format-help');
  if (helpEl) helpEl.style.display = experts.length > 0 ? 'none' : '';
}

function renderExpertRow(expert) {
  const cc = expert.country_code;
  return `
    <tr class="hover:bg-gray-50 group ${expert.is_observer_only ? 'opacity-60' : ''}" data-expert-id="${expert.id}">
      <td class="px-3 py-2">
        <div class="flex items-center gap-1.5">
          ${flagImg(cc, 'w-6 h-4')}
          <span class="font-mono font-bold text-xs">${cc}</span>
        </div>
      </td>
      <td class="px-3 py-2">
        <input type="text" class="edit-name bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-0 py-0.5 text-sm font-medium w-full min-w-[140px]"
          value="${escHtml(expert.name)}" data-expert-id="${expert.id}" data-field="name" aria-label="Name for ${cc}" />
      </td>
      <td class="px-3 py-2 text-gray-600 text-xs">${expert.member_country}</td>
      <td class="px-3 py-1.5">${editableStarRating(expert.id, 'di', expert.skills.di)}</td>
      <td class="px-3 py-1.5">${editableStarRating(expert.id, 'fe', expert.skills.fe)}</td>
      <td class="px-3 py-1.5">${editableStarRating(expert.id, 'be', expert.skills.be)}</td>
      <td class="px-3 py-2 text-center">
        <button type="button" class="toggle-new w-6 h-6 rounded border text-xs font-bold ${expert.is_new ? 'bg-blue-100 text-blue-900 border-blue-300' : 'bg-gray-100 text-gray-900 border-gray-300'}"
          data-expert-id="${expert.id}" aria-label="Toggle new expert status for ${cc}" title="Toggle new expert">${expert.is_new ? 'Y' : 'N'}</button>
      </td>
      <td class="px-3 py-2">${prefDropdown(expert.id, 'di', expert.preferences.di)}</td>
      <td class="px-3 py-2">${prefDropdown(expert.id, 'fe', expert.preferences.fe)}</td>
      <td class="px-3 py-2">${prefDropdown(expert.id, 'be', expert.preferences.be)}</td>
      <td class="px-3 py-2">
        <input type="text" class="edit-notes bg-transparent border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:outline-none px-0 py-0.5 text-xs text-gray-500 w-full min-w-[80px]"
          value="${escHtml(expert.notes || '')}" data-expert-id="${expert.id}" data-field="notes" aria-label="Notes for ${cc}" placeholder="..." />
      </td>
      <td class="px-3 py-2">
        <button type="button" class="btn-delete-expert hidden group-hover:inline text-gray-600 hover:text-red-700 text-xs"
          data-expert-id="${expert.id}" aria-label="Remove expert ${cc}" title="Remove expert">&#10005;</button>
      </td>
    </tr>`;
}

function prefDropdown(expertId, skill, currentValue) {
  const cls = PREF_CLASS[currentValue] || PREF_CLASS.M;
  const skillNames = { di: 'Design Implementation', fe: 'Frontend', be: 'Backend' };
  const label = `${skillNames[skill] || skill} preference`;
  return `<select class="edit-pref text-xs font-medium px-1.5 py-1 rounded border cursor-pointer ${cls}"
    data-expert-id="${expertId}" data-skill="${skill}" aria-label="${label}">
    ${PREF_OPTIONS.map(opt =>
      `<option value="${opt}" ${currentValue === opt ? 'selected' : ''}>${PREF_DISPLAY[opt]}</option>`
    ).join('')}
  </select>`;
}


function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
