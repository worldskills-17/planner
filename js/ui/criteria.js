/**
 * Sub-criteria tracking page — which team marks what per session.
 * Sub-criteria are grouped by their session (day + AM/PM).
 */
import store from '../data/store.js';
import { showToast, SKILL_BG, SKILL_FULL_NAME } from './components.js';

let _unsubscribers = [];

export function render(container) {
  // Clean up previous subscriptions to prevent stale subscriber accumulation
  _unsubscribers.forEach(unsub => unsub());
  _unsubscribers = [];
  container.innerHTML = `
    <div class="p-6 max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Sub-criteria Assignment</h1>
        <button id="btn-auto-distribute" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
          Auto-distribute
        </button>
      </div>

      <p class="text-sm text-gray-500 mb-4">Assign sub-criteria to marking teams for each session.</p>

      <div id="criteria-content"></div>
    </div>`;

  container.querySelector('#btn-auto-distribute').addEventListener('click', () => {
    autoDistribute();
    showToast('Sub-criteria auto-distributed', 'success');
  });

  _unsubscribers.push(store.subscribe('sessions', () => renderContent(container)));
  _unsubscribers.push(store.subscribe('marking_scheme', () => renderContent(container)));
  renderContent(container);
}

function renderContent(container) {
  const el = container.querySelector('#criteria-content');
  if (!el) return;
  const scheme = store.state.marking_scheme;
  const sessionKeys = store.getMarkingSessionKeys();

  if (!scheme || !scheme.modules || scheme.modules.length === 0) {
    el.innerHTML = `<div class="text-center py-12 text-gray-400">
      <p>No marking scheme loaded</p>
      <p class="text-sm mt-1">Define modules and sub-criteria on the Modules page first</p>
    </div>`;
    return;
  }

  if (sessionKeys.length === 0) {
    el.innerHTML = `<div class="text-center py-12 text-gray-400">
      <p>No sessions configured</p>
      <p class="text-sm mt-1">Set up the competition first</p>
    </div>`;
    return;
  }

  // Group sub-criteria by their session key (e.g. C1-PM, C2-AM)
  const bySession = {};
  for (const mod of scheme.modules) {
    for (const sc of mod.sub_criteria) {
      const day = sc.day_of_marking || 1;
      const half = sc.session_half || 'AM';
      const sessionKey = `C${day}-${half}`;
      if (!bySession[sessionKey]) bySession[sessionKey] = [];
      bySession[sessionKey].push({
        ...sc,
        moduleId: mod.id,
        moduleName: mod.name,
        primary_skill: mod.primary_skill,
      });
    }
  }

  el.innerHTML = `
    <div class="space-y-6">
      ${sessionKeys.map(sessionKey => {
        const subCriteria = bySession[sessionKey] || [];
        if (subCriteria.length === 0) return '';
        return renderSessionSection(sessionKey, subCriteria);
      }).join('')}
    </div>`;

  // Wire up assignment dropdowns
  el.querySelectorAll('.sc-assign-select').forEach(select => {
    select.addEventListener('change', (e) => {
      assignSubCriterion(e.target.dataset.session, e.target.dataset.scId, e.target.value);
    });
  });
}

function renderSessionSection(sessionKey, subCriteria) {
  const session = store.state.sessions[sessionKey];
  if (!session) return '';

  return `
    <div class="bg-white rounded-xl border shadow-sm overflow-hidden">
      <div class="px-4 py-3 bg-gray-50 border-b flex items-center justify-between">
        <h2 class="font-semibold">${sessionKey}</h2>
        <span class="text-xs text-gray-500">${subCriteria.length} sub-criteria &middot; ${session.teams.length} teams</span>
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
              <th class="px-3 py-2">ID</th>
              <th class="px-3 py-2">Module</th>
              <th class="px-3 py-2">Skill</th>
              <th class="px-3 py-2">Assigned Team</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            ${subCriteria.map(sc => {
              const skillClass = SKILL_BG[sc.primary_skill] || SKILL_BG.mixed;
              const currentTeam = findTeamForSC(session, sc.id);
              return `
                <tr class="hover:bg-gray-50">
                  <td class="px-3 py-2">
                    <span class="font-mono font-bold text-xs bg-gray-100 px-1.5 py-0.5 rounded">${sc.id}</span>
                  </td>
                  <td class="px-3 py-2 text-xs text-gray-500">${sc.moduleId} — ${sc.moduleName}</td>
                  <td class="px-3 py-2"><span class="px-1.5 py-0.5 rounded text-xs border ${skillClass}">${SKILL_FULL_NAME[sc.primary_skill] || '?'}</span></td>
                  <td class="px-3 py-2">
                    <select class="sc-assign-select text-xs border rounded px-2 py-1 bg-white" data-sc-id="${sc.id}" data-session="${sessionKey}" aria-label="Team assignment for ${sc.id} in ${sessionKey}">
                      <option value="">Unassigned</option>
                      ${session.teams.map(t => `<option value="${t.id}" ${currentTeam === t.id ? 'selected' : ''}>${t.name}</option>`).join('')}
                    </select>
                  </td>
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;
}

function findTeamForSC(session, scId) {
  for (const team of session.teams) {
    if (team.sub_criteria.includes(scId)) return team.id;
  }
  return '';
}

function assignSubCriterion(sessionKey, scId, teamId) {
  const session = store.state.sessions[sessionKey];
  if (!session) return;

  store.beginBatch();

  // Remove from all teams first
  for (const team of session.teams) {
    if (team.sub_criteria.includes(scId)) {
      store.assignSubCriteria(sessionKey, team.id, team.sub_criteria.filter(id => id !== scId));
    }
  }

  // Add to target team
  if (teamId) {
    const team = session.teams.find(t => t.id === teamId);
    if (team) {
      store.assignSubCriteria(sessionKey, teamId, [...team.sub_criteria, scId]);
    }
  }

  store.endBatch();
}

/**
 * Auto-distribute sub-criteria evenly across teams per session.
 */
function autoDistribute() {
  const scheme = store.state.marking_scheme;
  if (!scheme || !scheme.modules) return;

  // Group sub-criteria by session key
  const bySession = {};
  for (const mod of scheme.modules) {
    for (const sc of mod.sub_criteria) {
      const day = sc.day_of_marking || 1;
      const half = sc.session_half || 'AM';
      const sessionKey = `C${day}-${half}`;
      if (!bySession[sessionKey]) bySession[sessionKey] = [];
      bySession[sessionKey].push(sc.id);
    }
  }

  store._saveUndo();

  for (const [sessionKey, scIds] of Object.entries(bySession)) {
    const session = store.state.sessions[sessionKey];
    if (!session) continue;

    const teamCount = session.teams.length;
    if (teamCount === 0) continue;

    // Clear existing assignments
    for (const team of session.teams) {
      team.sub_criteria = [];
    }

    // Round-robin distribute
    for (let i = 0; i < scIds.length; i++) {
      const teamIdx = i % teamCount;
      session.teams[teamIdx].sub_criteria.push(scIds[i]);
    }
  }

  store._notify('sessions');
}
