/**
 * Main application — routing, navigation, competition setup.
 */
import store from './data/store.js';
import { saveToJSON, loadFromJSON } from './data/exporter.js';
import { showToast, showModal } from './ui/components.js';
import * as roster from './ui/roster.js';
import * as modules from './ui/modules.js';
import * as allocation from './ui/allocation.js';
import * as criteria from './ui/criteria.js';
import * as overview from './ui/overview.js';

const pages = {
  roster: { label: 'Experts', icon: '&#128101;', render: roster.render },
  modules: { label: 'Modules', icon: '&#128221;', render: modules.render },
  allocation: { label: 'Schedule', icon: '&#128203;', render: allocation.render },
  criteria: { label: 'Sub-criteria', icon: '&#128200;', render: criteria.render },
  overview: { label: 'Overview', icon: '&#128202;', render: overview.render },
};

let currentPage = 'allocation';

function init() {
  renderShell();
  handleRoute();
  window.addEventListener('hashchange', handleRoute);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'z') {
      e.preventDefault();
      if (store.undo()) showToast('Undone', 'info', 1500);
    }
    if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
      e.preventDefault();
      if (store.redo()) showToast('Redone', 'info', 1500);
    }
    if (e.ctrlKey && e.key === 's') {
      e.preventDefault();
      saveToJSON();
      showToast('Saved', 'success', 1500);
    }
  });
}

function renderShell() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <!-- Top bar + Navigation (sticky together) -->
    <div class="sticky top-0 z-30 bg-white shadow-sm">
      <header class="border-b border-gray-200 px-4 py-2 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <img src="img/ws_logo_dark-blue.png" alt="WorldSkills" class="h-8" />
          <h1 class="font-bold text-lg">Experts Allocation Planner</h1>
          <span id="comp-name" class="text-sm font-medium text-blue-700 bg-blue-50 px-2 py-0.5 rounded hidden"></span>
        </div>

        <div class="flex items-center gap-2">
          <button id="btn-setup" class="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200" title="Competition Setup">Setup</button>
          <button id="btn-save" class="px-3 py-1.5 text-sm bg-emerald-100 text-emerald-700 rounded-lg hover:bg-emerald-200" title="Save JSON (Ctrl+S)">Save</button>
          <label class="px-3 py-1.5 text-sm bg-gray-100 rounded-lg cursor-pointer hover:bg-gray-200" title="Load JSON" role="button">
            <span>Load</span>
            <input type="file" id="btn-load" accept=".json" class="hidden" aria-label="Load saved JSON file" />
          </label>
        </div>
      </header>

      <nav class="border-b border-gray-100 px-4">
        <div class="flex gap-1" id="main-nav"></div>
      </nav>
    </div>

    <!-- Page content -->
    <main id="page-content" class="flex-1 overflow-auto bg-gray-50 pb-8"></main>

    <!-- Footer -->
    <footer class="bg-white border-t border-gray-200 px-4 py-2 text-center text-xs text-gray-600">
      &copy; ${new Date().getFullYear()} | Developed and maintained by Val Adamescu
    </footer>`;

  // Nav
  renderNav();

  // Events
  document.getElementById('btn-setup').addEventListener('click', showSetupDialog);
  document.getElementById('btn-save').addEventListener('click', () => {
    saveToJSON();
    showToast('State saved to file', 'success');
  });
  document.getElementById('btn-load').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await loadFromJSON(file);
      showToast('State loaded', 'success');
      renderNav();
      renderPage();
    } catch (err) {
      showToast(`Load failed: ${err.message}`, 'error', 5000);
    }
    e.target.value = '';
  });

  // Show competition name
  store.subscribe('competition', (state) => {
    const el = document.getElementById('comp-name');
    if (state.competition.name) {
      el.textContent = state.competition.name;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
}

function renderNav() {
  const nav = document.getElementById('main-nav');
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', 'Main navigation');
  nav.innerHTML = Object.entries(pages).map(([key, page]) => {
    const active = key === currentPage;
    return `<button role="tab" aria-selected="${active}" class="nav-link px-4 py-2.5 text-sm font-medium border-b-2 transition-colors
      ${active ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'}"
      data-page="${key}">${page.label}</button>`;
  }).join('');

  nav.querySelectorAll('.nav-link').forEach(btn => {
    btn.addEventListener('click', () => {
      window.location.hash = btn.dataset.page;
    });
  });
}

function handleRoute() {
  const hash = window.location.hash.replace('#', '') || 'allocation';
  if (pages[hash]) {
    currentPage = hash;
  } else {
    currentPage = 'allocation';
  }
  renderNav();
  renderPage();
}

function renderPage() {
  const content = document.getElementById('page-content');
  const page = pages[currentPage];
  if (page) {
    content.innerHTML = '';
    page.render(content);
  }
}

function showSetupDialog() {
  const state = store.state.competition;

  const html = `
    <div class="space-y-4">
      <div>
        <label class="block text-sm font-medium mb-1">Competition Name</label>
        <input type="text" id="setup-name" value="${state.name}" placeholder="e.g. WorldSkills Shanghai 2026"
          class="w-full px-3 py-2 border rounded-lg text-sm" />
      </div>
      <div class="grid grid-cols-3 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">Days</label>
          <select id="setup-days" class="w-full px-3 py-2 border rounded-lg text-sm">
            <option value="3" ${state.days === 3 ? 'selected' : ''}>3 (EuroSkills)</option>
            <option value="4" ${state.days === 4 ? 'selected' : ''}>4 (WorldSkills)</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">No. of marking teams</label>
          <input type="number" id="setup-teams" value="${state.teamsPerSession}" min="2" max="8"
            class="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Experts on floor</label>
          <input type="number" id="setup-floor" value="${state.floorPerSession}" min="2" max="6"
            class="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
      </div>
    </div>`;

  showModal('Competition Setup', html, {
    confirmText: 'Apply',
    onConfirm: () => {
      const name = document.getElementById('setup-name').value;
      const days = parseInt(document.getElementById('setup-days').value);
      const teams = parseInt(document.getElementById('setup-teams').value);
      const floor = parseInt(document.getElementById('setup-floor').value);

      store.initCompetition(name, days, teams, floor);

      showToast(`Competition "${name}" configured — ${days} days, ${teams} teams`, 'success');
      renderPage();
    },
  });
}

// Boot
document.addEventListener('DOMContentLoaded', init);
