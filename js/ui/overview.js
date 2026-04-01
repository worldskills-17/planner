/**
 * Overview page — simplified grid showing expert assignments across all sessions.
 * Rows = experts, Columns = sessions, Cells = team/floor/free.
 */
import store from '../data/store.js';
import { flagImg } from './components.js';

let _unsubscribers = [];
let _sortMode = 'country'; // 'country' or a session key like 'C1-PM'

export function render(container) {
  _unsubscribers.forEach(u => u());
  _unsubscribers = [];

  const sessionKeys = store.getSessionKeys();
  if (store.state.experts.length === 0 || sessionKeys.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-gray-500">
      <p class="text-lg">No data available</p>
      <p class="text-sm mt-1">Import experts and configure the competition first.</p>
    </div>`;
    return;
  }

  container.innerHTML = `
    <div class="max-w-[1600px] mx-auto">
      <div class="px-4 py-3 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
        <h1 class="text-2xl font-bold">Overview</h1>
        <div class="flex items-center gap-2">
          <span class="text-sm text-gray-500">Sort by:</span>
          <select id="overview-sort" class="text-sm border border-gray-300 rounded-lg px-2 py-1" aria-label="Sort overview by">
            <option value="country">Country</option>
            ${sessionKeys.filter(k => k !== 'C1-AM').map(k => `<option value="${k}"${_sortMode === k ? ' selected' : ''}>Team in ${k}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="px-4 pt-3 pb-8 overflow-x-auto">
        <table class="border-collapse text-sm table-fixed mx-auto" style="width:auto" id="overview-table" aria-label="Expert allocation overview across all sessions"></table>
      </div>
    </div>`;

  container.querySelector('#overview-sort').addEventListener('change', (e) => {
    _sortMode = e.target.value;
    renderTable(container, sessionKeys);
  });

  renderTable(container, sessionKeys);

  _unsubscribers.push(store.subscribe('sessions', () => renderTable(container, sessionKeys)));
  _unsubscribers.push(store.subscribe('experts', () => renderTable(container, sessionKeys)));
}

function renderTable(container, sessionKeys) {
  const table = container.querySelector('#overview-table');
  if (!table) return;

  const state = store.state;
  const experts = [...state.experts];

  // Build lookup: expertId → { sessionKey → { role, teamName } }
  const assignments = {};
  for (const expert of experts) {
    assignments[expert.id] = {};
  }

  for (const key of sessionKeys) {
    const session = state.sessions[key];
    if (!session) continue;

    for (const team of session.teams) {
      if (team.lead && assignments[team.lead]) {
        assignments[team.lead][key] = { role: 'supervisor', team: team.name };
      }
      for (const eid of team.experts) {
        if (assignments[eid]) {
          assignments[eid][key] = { role: 'expert', team: team.name };
        }
      }
      for (const eid of (team.observers || [])) {
        if (assignments[eid]) {
          assignments[eid][key] = { role: 'observer', team: team.name };
        }
      }
    }
    for (const eid of session.floor) {
      if (assignments[eid]) {
        assignments[eid][key] = { role: 'floor' };
      }
    }
  }

  // Sort
  if (_sortMode === 'country') {
    experts.sort((a, b) => a.country_code.localeCompare(b.country_code));
  } else {
    experts.sort((a, b) => {
      const aE = assignments[a.id][_sortMode];
      const bE = assignments[b.id][_sortMode];
      const aTeam = aE ? aE.team || 'zzz' : 'zzz';
      const bTeam = bE ? bE.team || 'zzz' : 'zzz';
      const aRole = aE ? (aE.role === 'supervisor' ? '0' : aE.role === 'floor' ? '2' : '1') : '3';
      const bRole = bE ? (bE.role === 'supervisor' ? '0' : bE.role === 'floor' ? '2' : '1') : '3';
      return aTeam.localeCompare(bTeam) || aRole.localeCompare(bRole) || a.country_code.localeCompare(b.country_code);
    });
  }

  // Count stats per expert
  const stats = {};
  for (const expert of experts) {
    const a = assignments[expert.id];
    let marking = 0, floor = 0, free = 0;
    for (const key of sessionKeys) {
      const entry = a[key];
      if (!entry) { free++; continue; }
      if (entry.role === 'supervisor' || entry.role === 'expert' || entry.role === 'observer') { marking++; }
      else if (entry.role === 'floor') { floor++; }
    }
    stats[expert.id] = { marking, floor, free };
  }

  const CELL_STYLES = {
    supervisor: 'background:#fef3c7;color:#92400e;font-weight:600',
    expert: 'background:#dbeafe;color:#1e40af',
    observer: 'background:#e5e7eb;color:#374151',
    floor: 'background:#f3e8ff;color:#6b21a8',
  };

  // Determine day boundaries (solid) and AM/PM boundaries (dotted)
  const dayBoundaries = new Set();
  const halfBoundaries = new Set();
  for (let i = 1; i < sessionKeys.length; i++) {
    const prev = sessionKeys[i - 1].charAt(1);
    const curr = sessionKeys[i].charAt(1);
    if (curr !== prev) dayBoundaries.add(i);
    else halfBoundaries.add(i);
  }

  let html = `<thead class="sticky top-0 z-10">
    <tr class="bg-gray-100 text-xs text-gray-600 uppercase tracking-wider">
      <th class="px-3 py-2 text-left sticky left-0 bg-gray-100 z-20 w-[160px]" style="border-right:2px solid #9ca3af">Expert</th>
      ${sessionKeys.map((k, i) => {
        const border = dayBoundaries.has(i) ? 'border-left:2px solid #9ca3af;' : halfBoundaries.has(i) ? 'border-left:1px dotted #d1d5db;' : '';
        return `<th class="px-1 py-2 text-center w-[100px]" style="${border}">${k}</th>`;
      }).join('')}
      <th class="px-1 py-2 text-center w-[72px]" style="border-left:2px solid #9ca3af" title="Marking sessions">M</th>
      <th class="px-1 py-2 text-center w-[72px]" style="border-left:1px dotted #d1d5db" title="Floor sessions">F</th>
      <th class="px-1 py-2 text-center w-[72px]" style="border-left:1px dotted #d1d5db" title="Free sessions">R</th>
    </tr>
  </thead><tbody>`;

  for (const expert of experts) {
    const a = assignments[expert.id];
    const s = stats[expert.id];

    html += `<tr class="border-b border-gray-100 hover:bg-gray-50">
      <td class="px-3 py-1.5 sticky left-0 bg-white z-10" style="border-right:2px solid #9ca3af">
        <div class="flex items-center gap-2">
          ${flagImg(expert.country_code, 'w-7 h-5')}
          <span class="font-mono font-bold text-sm">${expert.country_code}</span>
        </div>
      </td>`;

    for (let i = 0; i < sessionKeys.length; i++) {
      const key = sessionKeys[i];
      const entry = a[key];
      const dayBorder = dayBoundaries.has(i) ? 'border-left:2px solid #9ca3af;' : halfBoundaries.has(i) ? 'border-left:1px dotted #d1d5db;' : '';
      if (!entry) {
        html += `<td class="px-1 py-1.5 text-center text-sm" style="${dayBorder}"></td>`;
      } else {
        const cellStyle = CELL_STYLES[entry.role] || '';
        let label = '';
        if (entry.role === 'supervisor') label = `&#9733; ${entry.team}`;
        else if (entry.role === 'expert') label = entry.team;
        else if (entry.role === 'observer') label = `Obs ${entry.team}`;
        else if (entry.role === 'floor') label = 'Floor';
        html += `<td class="px-1 py-1.5 text-center text-sm font-bold rounded" style="${dayBorder}${cellStyle}">${label}</td>`;
      }
    }

    // Stats columns
    const restOk = s.free >= 2;
    html += `<td class="px-1 py-1.5 text-center text-sm font-medium" style="border-left:2px solid #9ca3af">${s.marking}</td>`;
    html += `<td class="px-1 py-1.5 text-center text-sm font-medium" style="border-left:1px dotted #d1d5db">${s.floor}</td>`;
    html += `<td class="px-1 py-1.5 text-center text-sm font-medium ${restOk ? '' : 'text-red-600 font-bold'}" style="border-left:1px dotted #d1d5db">${s.free}</td>`;

    html += '</tr>';
  }

  html += '</tbody>';
  table.innerHTML = html;
}
