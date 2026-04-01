/**
 * Main Allocation page — session tabs, team cards, floor, free pool, drag-drop.
 */
import store from "../data/store.js";
import {
  expertCard,
  initDragDrop,
  showToast,
  showModal,
  teamRadarChart,
  skillBadge,
  flagImg,
} from "./components.js";
import {
  validateSession,
  getTeamPrimarySkill,
} from "../validation/validator.js";
import { autoAllocate, autoAllocateAll } from "../solver/allocator.js";
import {
  resolveExperts,
  getTeamMembers,
  calcSkillAvg,
  getScoreColour,
} from "../shared.js";

let currentSession = null;
let _unsubscribers = [];

function avgScoreBox(label, value) {
  const c = getScoreColour(value);
  return `<div class="rounded-lg p-2.5 text-center" style="background:${c.bg};border:1px solid ${c.border}">
    <div class="font-bold text-2xl" style="color:${c.text}">${value.toFixed(1)}</div>
    <div class="text-xs font-medium" style="color:${c.text}">${label}</div>
  </div>`;
}

export function render(container) {
  // Clean up previous subscriptions to prevent stale subscriber accumulation
  _unsubscribers.forEach((unsub) => unsub());
  _unsubscribers = [];
  const sessionKeys = store.getSessionKeys();
  if (sessionKeys.length === 0) {
    container.innerHTML = `<div class="p-6 text-center text-gray-500">
      <p class="text-lg">No competition configured</p>
      <p class="text-sm mt-1">Set up the competition first (days, teams) from the settings</p>
    </div>`;
    return;
  }

  if (!currentSession || !sessionKeys.includes(currentSession)) {
    currentSession = sessionKeys[0];
  }

  container.innerHTML = `
    <div class="max-w-[1600px] mx-auto">
      <div class="flex items-center justify-between sticky top-0 z-10 bg-gray-50 px-4 py-3 border-b border-gray-200">
        <h1 class="text-2xl font-bold">Schedule</h1>
        <div class="flex items-center gap-2">
          <div id="validation-inline" class="contents"></div>
          <span class="w-px h-5 bg-gray-300"></span>
          <button id="btn-add-team" class="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200" title="Add a team to this session">+ Team</button>
          <button id="btn-remove-team" class="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200" title="Remove last empty team">- Team</button>
          <span class="w-px h-5 bg-gray-300"></span>
          <button id="btn-auto-all" class="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700" title="Auto-allocate all sessions with rotation">All Sessions</button>
          <button id="btn-auto-allocate" class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700" title="Auto-allocate this session only">This Session</button>
          <span class="w-px h-5 bg-gray-300"></span>
          <button id="btn-undo" class="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 disabled:text-gray-500 disabled:bg-gray-50 disabled:cursor-not-allowed" title="Undo (Ctrl+Z)">Undo</button>
          <button id="btn-redo" class="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200 disabled:text-gray-500 disabled:bg-gray-50 disabled:cursor-not-allowed" title="Redo (Ctrl+Y)">Redo</button>
        </div>
      </div>

      <!-- Session Tabs -->
      <div id="session-tabs" class="flex gap-1 sticky top-[48px] z-10 bg-gray-50 px-4 pt-3 pb-2 overflow-x-auto" role="tablist" aria-label="Session tabs"></div>

      <!-- Main grid: Teams + Floor/Free -->
      <div class="flex gap-4 px-4 pt-2 pb-4" id="allocation-main">
        <!-- Teams area -->
        <div class="flex-1" id="teams-area"></div>

        <!-- Right panel: Floor + Free -->
        <div class="w-72 shrink-0 space-y-4" id="side-panel">
          <div id="floor-area"></div>
          <div id="free-area"></div>
        </div>
      </div>

    </div>`;

  // Undo/Redo - To be extended with keyboard shortcuts later
  container.querySelector("#btn-undo").addEventListener("click", () => {
    store.undo();
    showToast("Undone", "info", 1500);
  });
  container.querySelector("#btn-redo").addEventListener("click", () => {
    store.redo();
    showToast("Redone", "info", 1500);
  });
  container
    .querySelector("#btn-auto-allocate")
    .addEventListener("click", () => {
      if (!currentSession) return;
      try {
        autoAllocate(currentSession);
        renderSession(container);
        showToast("Auto-allocated " + currentSession, "success", 2000);
      } catch (err) {
        console.error("Auto-allocate error:", err);
        showToast("Auto-allocate failed: " + err.message, "error", 5000);
      }
    });
  container.querySelector("#btn-auto-all").addEventListener("click", () => {
    try {
      autoAllocateAll();
      renderSession(container);
      showToast("Auto-allocated all sessions with rotation", "success", 3000);
    } catch (err) {
      console.error("Auto-allocate all error:", err);
      showToast("Auto-allocate failed: " + err.message, "error", 5000);
    }
  });

  // Add/Remove teams
  container.querySelector("#btn-add-team").addEventListener("click", () => {
    if (!currentSession) return;
    const session = store.state.sessions[currentSession];
    if (!session) return;
    const num = session.teams.length + 1;
    session.teams.push({
      id: `team-${num}`,
      name: `Team ${num}`,
      sub_criteria: [],
      lead: null,
      experts: [],
      observers: [],
    });
    store.set(`sessions.${currentSession}`, session);
    showToast(`Team ${num} added`, "success", 1500);
  });
  container.querySelector("#btn-remove-team").addEventListener("click", () => {
    if (!currentSession) return;
    const session = store.state.sessions[currentSession];
    if (!session || session.teams.length <= 1) return;
    const last = session.teams[session.teams.length - 1];
    // Only remove if empty
    if (
      last.lead ||
      last.experts.length > 0 ||
      (last.observers || []).length > 0
    ) {
      showToast(
        "Cannot remove — team has members. Clear it first.",
        "warning",
        3000,
      );
      return;
    }
    session.teams.pop();
    store.set(`sessions.${currentSession}`, session);
    showToast("Team removed", "info", 1500);
  });

  // Drag-drop
  initDragDrop(container.querySelector("#allocation-main"));

  container
    .querySelector("#allocation-main")
    .addEventListener("expert-drop", (e) => {
      handleDrop(e.detail);
    });

  // Subscribe (with cleanup tracking)
  _unsubscribers.push(
    store.subscribe("sessions", () => renderSession(container)),
  );
  _unsubscribers.push(
    store.subscribe("experts", () => renderSession(container)),
  );

  renderTabs(container);
  renderSession(container);
}

function renderTabs(container) {
  const tabsEl = container.querySelector("#session-tabs");
  const sessionKeys = store.getSessionKeys();

  tabsEl.innerHTML = sessionKeys
    .map((key) => {
      const isC1AM = key === "C1-AM";
      const active = key === currentSession;
      const label = isC1AM ? `${key} (floor only)` : key;
      return `<button class="session-tab px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors
      ${active ? "bg-blue-600 text-white shadow" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}
      ${isC1AM ? "italic" : ""}"
      data-session="${key}" aria-label="Session ${key}${active ? " (current)" : ""}" ${active ? 'aria-current="true"' : ""}>${label}</button>`;
    })
    .join("");

  tabsEl.querySelectorAll(".session-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentSession = btn.dataset.session;
      renderTabs(container);
      renderSession(container);
    });
  });
}

function renderSession(container) {
  if (!container.querySelector("#teams-area")) return;
  const session = store.state.sessions[currentSession];
  if (!session) return;

  const isFloorOnly = currentSession === "C1-AM";
  const experts = store.state.experts;

  // Update undo/redo buttons
  const undoBtn = container.querySelector("#btn-undo");
  const redoBtn = container.querySelector("#btn-redo");
  if (undoBtn) undoBtn.disabled = !store.canUndo;
  if (redoBtn) redoBtn.disabled = !store.canRedo;

  // Teams area
  const teamsArea = container.querySelector("#teams-area");
  if (isFloorOnly) {
    teamsArea.innerHTML = `<div class="text-center py-8 text-gray-500">
      <p>C1-AM is floor duty only — no marking teams</p>
    </div>`;
  } else {
    teamsArea.innerHTML = `<div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
      ${session.teams.map((team) => renderTeamCard(team, currentSession)).join("")}
    </div>`;
  }

  // Floor area
  const floorArea = container.querySelector("#floor-area");
  const floorExperts = session.floor
    .map((id) => store.getExpert(id))
    .filter(Boolean);
  floorArea.innerHTML = `
    <div class="bg-purple-50 rounded-xl border border-purple-200 p-3">
      <div class="flex items-center justify-between mb-2">
        <h2 class="font-semibold text-sm text-purple-800">Floor Duty</h2>
        <span class="text-xs text-purple-600">${floorExperts.length} / ${store.state.competition.floorPerSession}</span>
      </div>
      <div class="drop-target space-y-1.5 min-h-[48px] rounded-lg p-1" data-drop-zone="floor">
        ${floorExperts.map((exp) => expertCard(exp, { compact: true, role: "floor" })).join("")}
        ${floorExperts.length === 0 ? '<div class="text-xs text-gray-500 text-center py-3 border-2 border-dashed border-purple-200 rounded-lg">Drop expert for floor duty</div>' : ""}
      </div>
    </div>`;

  // Free pool
  const freeArea = container.querySelector("#free-area");
  const freeExperts = resolveExperts(session.free).sort((a, b) =>
    a.country_code.localeCompare(b.country_code),
  );

  freeArea.innerHTML = `
    <div class="bg-gray-50 rounded-xl border border-gray-200 p-3">
      <div class="flex items-center justify-between mb-2">
        <h2 class="font-semibold text-sm text-gray-700">Unassigned</h2>
        <span class="text-xs text-gray-500">${freeExperts.length}</span>
      </div>
      <div class="drop-target space-y-1 max-h-[50vh] overflow-y-auto min-h-[48px] rounded-lg p-1" data-drop-zone="free">
        ${freeExperts.map((exp) => expertCard(exp, { compact: true, role: "free" })).join("")}
        ${freeExperts.length === 0 ? '<div class="text-xs text-gray-500 text-center py-3 border-2 border-dashed border-gray-200 rounded-lg">All experts assigned</div>' : ""}
      </div>
    </div>`;

  // Marking room change handlers
  container.querySelectorAll(".marking-room-select").forEach((sel) => {
    sel.addEventListener("change", () => {
      const teamId = sel.dataset.teamId;
      const val = sel.value ? parseInt(sel.value, 10) : null;
      const sess = store.state.sessions[currentSession];
      if (!sess) return;
      const team = sess.teams.find((t) => t.id === teamId);
      if (team) {
        team.marking_room = val;
        store._notify("sessions");
      }
    });
  });

  // Radar chart click → modal with large version
  container.querySelectorAll(".radar-thumb").forEach((el) => {
    el.addEventListener("click", () => {
      const teamId = el.dataset.teamId;
      const session = store.state.sessions[currentSession];
      if (!session) return;
      const team = session.teams.find((t) => t.id === teamId);
      if (!team) return;

      const lead = team.lead ? store.getExpert(team.lead) : null;
      const allMembers = getTeamMembers(team);

      if (allMembers.length === 0) return;

      const avg = calcSkillAvg(allMembers);

      const bigRadar = teamRadarChart(avg, 500);

      const memberList = allMembers
        .map((e) => {
          const isLead = team.lead === e.id;
          return `
        <div class="flex items-center justify-between py-2 ${isLead ? "bg-amber-50 -mx-3 px-3 rounded-lg" : ""}">
          <div class="flex items-center gap-2">
            ${flagImg(e.country_code, "w-7 h-5")}
            <span class="font-mono font-bold text-sm">${e.country_code}</span>
            <span class="font-medium">${e.name}</span>
            ${isLead ? '<span class="text-xs font-bold text-amber-700">SUPERVISOR</span>' : ""}
          </div>
          <div class="flex gap-1">${skillBadge("di", e.skills.di)}${skillBadge("fe", e.skills.fe)}${skillBadge("be", e.skills.be)}</div>
        </div>`;
        })
        .join("");

      showModal(
        `${team.name} — Skill Profile`,
        `
        <div class="flex gap-6 items-start">
          <!-- Left: Radar + scores -->
          <div class="shrink-0 flex flex-col items-center">
            ${bigRadar}
            <div class="grid grid-cols-3 gap-2 mt-3 w-full">
              ${avgScoreBox("Design Impl.", avg.di)}
              ${avgScoreBox("Frontend", avg.fe)}
              ${avgScoreBox("Backend", avg.be)}
            </div>
          </div>
          <!-- Right: Members -->
          <div class="flex-1 min-w-0">
            <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Team Members (${allMembers.length})</h4>
            <div class="divide-y divide-gray-100">${memberList}</div>
            ${
              team.sub_criteria.length > 0
                ? `
              <div class="mt-4 pt-3 border-t">
                <h4 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Sub-criteria</h4>
                <div class="flex flex-wrap gap-1">${team.sub_criteria.map((sc) => `<span class="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">${sc}</span>`).join("")}</div>
              </div>`
                : ""
            }
          </div>
        </div>
      `,
        { showCancel: false, confirmText: "Close", wide: true },
      );
    });
  });

  // Validation
  renderValidation();
}

function renderTeamCard(team, sessionKey) {
  const lead = team.lead ? store.getExpert(team.lead) : null;
  const teamExperts = team.experts
    .map((id) => store.getExpert(id))
    .filter(Boolean);
  const teamObservers = (team.observers || [])
    .map((id) => store.getExpert(id))
    .filter(Boolean);
  const primarySkill = getTeamPrimarySkill(team);

  // Calculate team stats (lead + experts only, not observers)
  const allMembers = [...teamExperts];
  if (lead) allMembers.push(lead);

  const teamAvg = calcSkillAvg(allMembers);

  const hasFive = primarySkill
    ? allMembers.some((e) => e.skills[primarySkill] === 5)
    : false;

  const SKILL_BORDER = {
    di: "border-l-violet-400",
    fe: "border-l-sky-400",
    be: "border-l-amber-400",
  };
  const borderClass = primarySkill ? SKILL_BORDER[primarySkill] || "" : "";

  // Radar chart (only if team has members)
  const radar = allMembers.length > 0 ? teamRadarChart(teamAvg, 120) : "";

  return `
    <div class="bg-white rounded-xl border shadow-sm overflow-hidden border-l-4 ${borderClass}">
      <div class="px-4 py-2.5 bg-gray-50 flex items-center justify-between border-b">
        <div class="flex items-center gap-2">
          <h2 class="font-bold text-base">${team.name}</h2>
          ${team.sub_criteria.length > 0 ? `<span class="text-xs text-gray-500 font-mono">${team.sub_criteria.join(", ")}</span>` : ""}
        </div>
        <div class="flex items-center gap-3">
          <span class="flex items-center gap-1.5 text-xs text-gray-600">
            <span class="font-medium">Room</span>
            <select class="marking-room-select text-xs border border-gray-300 rounded px-1.5 py-0.5 bg-white" data-team-id="${team.id}" aria-label="Marking room for ${team.name}">
              <option value=""${!team.marking_room ? " selected" : ""}>—</option>
              ${[1, 2, 3, 4, 5, 6].map((n) => `<option value="${n}"${team.marking_room === n ? " selected" : ""}>${n}</option>`).join("")}
            </select>
          </span>
          ${
            primarySkill && allMembers.length > 0
              ? `<span class="text-xs font-medium ${hasFive ? "text-emerald-800" : "text-red-700"}">
            ${hasFive ? "&#10003; 5&#9733;" : "No 5&#9733;"} in ${primarySkill.toUpperCase()}
          </span>`
              : ""
          }
        </div>
      </div>

      <div class="p-3 flex gap-3">
        <!-- Team members -->
        <div class="flex-1 space-y-2">
          <!-- Lead slot -->
          <div>
            <div class="text-xs font-semibold text-amber-700 mb-1">Marking Supervisor</div>
            <div class="drop-target min-h-[40px] rounded-lg" data-drop-zone="lead-${team.id}">
              ${lead ? expertCard(lead, { role: "lead", compact: true }) : '<div class="text-xs text-gray-500 text-center py-2.5 border-2 border-dashed border-amber-200 rounded-lg">Drop supervisor here</div>'}
            </div>
          </div>

          <!-- Expert slots -->
          <div>
            <div class="text-xs font-semibold text-blue-700 mb-1">Experts (${teamExperts.length}/3)</div>
            <div class="drop-target space-y-1 min-h-[40px] rounded-lg" data-drop-zone="expert-${team.id}">
              ${teamExperts.map((exp) => expertCard(exp, { role: "expert", compact: true })).join("")}
              ${teamExperts.length < 3 ? `<div class="text-xs text-gray-500 text-center py-2.5 border-2 border-dashed border-blue-200 rounded-lg">Drop expert here (${3 - teamExperts.length} more)</div>` : ""}
            </div>
          </div>

          <!-- Observer section (only shown if observers present or for drop target) -->
          ${
            teamObservers.length > 0
              ? `
          <div>
            <div class="text-xs font-semibold text-gray-500 mb-1">Observers (${teamObservers.length})</div>
            <div class="space-y-1">
              ${teamObservers.map((exp) => expertCard(exp, { role: "free", compact: true })).join("")}
            </div>
          </div>`
              : ""
          }
        </div>

        <!-- Radar chart (click to enlarge) -->
        ${radar ? `<div class="shrink-0 flex items-center cursor-pointer hover:opacity-80 transition-opacity radar-thumb" data-team-id="${team.id}" title="Click to enlarge">${radar}</div>` : ""}
      </div>
    </div>`;
}

function handleDrop(detail) {
  const { expertId, zoneId } = detail;
  if (!expertId || !currentSession) return;

  if (zoneId === "free") {
    store.moveExpert(currentSession, expertId, "free");
  } else if (zoneId === "floor") {
    store.moveExpert(currentSession, expertId, "floor");
  } else if (zoneId.startsWith("lead-")) {
    const teamId = zoneId.replace("lead-", "");
    const session = store.state.sessions[currentSession];
    const targetTeam = session
      ? session.teams.find((t) => t.id === teamId)
      : null;

    if (targetTeam && targetTeam.lead && targetTeam.lead !== expertId) {
      // Swap: find where the dragged expert is coming from
      const oldLeadId = targetTeam.lead;
      const sourceInfo = _findExpertPosition(session, expertId);

      // Use store's undo-aware mutation: remove both, place both
      store._saveUndo();
      store._removeExpertFromSession(session, expertId);
      store._removeExpertFromSession(session, oldLeadId);

      // Place dragged expert as new lead
      targetTeam.lead = expertId;

      // Place old lead into the source position of the dragged expert
      if (sourceInfo.role === "lead" && sourceInfo.teamId) {
        const srcTeam = session.teams.find((t) => t.id === sourceInfo.teamId);
        if (srcTeam) srcTeam.lead = oldLeadId;
        else session.free.push(oldLeadId);
      } else if (sourceInfo.role === "expert" && sourceInfo.teamId) {
        const srcTeam = session.teams.find((t) => t.id === sourceInfo.teamId);
        if (srcTeam && srcTeam.experts.length < 3) {
          srcTeam.experts.push(oldLeadId);
        } else if (targetTeam.experts.length < 3) {
          targetTeam.experts.push(oldLeadId);
        } else {
          session.free.push(oldLeadId);
        }
      } else if (sourceInfo.role === "floor") {
        session.floor.push(oldLeadId);
      } else {
        // Source was free or unknown — put old lead as expert on same team if room, else free
        if (targetTeam.experts.length < 3) {
          targetTeam.experts.push(oldLeadId);
        } else {
          session.free.push(oldLeadId);
        }
      }

      store._notify("sessions");
    } else {
      store.moveExpert(currentSession, expertId, "lead", teamId);
    }
  } else if (zoneId.startsWith("expert-")) {
    const teamId = zoneId.replace("expert-", "");
    store.moveExpert(currentSession, expertId, "expert", teamId);
  }
}

/**
 * Find the current position of an expert within a session.
 * Returns { role: 'free'|'floor'|'lead'|'expert'|'observer', teamId?: string }
 */
function _findExpertPosition(session, expertId) {
  if (session.free.includes(expertId)) return { role: "free" };
  if (session.floor.includes(expertId)) return { role: "floor" };
  for (const team of session.teams) {
    if (team.lead === expertId) return { role: "lead", teamId: team.id };
    if (team.experts.includes(expertId))
      return { role: "expert", teamId: team.id };
    if ((team.observers || []).includes(expertId))
      return { role: "observer", teamId: team.id };
  }
  return { role: "free" };
}

function renderValidation() {
  const area = document.getElementById("validation-inline");
  if (!area) return;

  const violations = validateSession(currentSession);
  if (violations.length === 0) {
    area.innerHTML = "";
    return;
  }

  const hard = violations.filter((v) => v.type === "hard");
  const soft = violations.filter((v) => v.type === "soft");

  const bgColour = hard.length > 0 ? "#b91c1c" : "#ffd600";
  const textColour = hard.length > 0 ? "#fff" : "#000";
  const bell =
    '<svg style="width:16px;height:16px" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>';

  let label = "";
  if (hard.length > 0) label += `<strong>${hard.length}</strong> hard`;
  if (hard.length > 0 && soft.length > 0) label += " | ";
  if (soft.length > 0) label += `<strong>${soft.length}</strong> soft`;

  area.innerHTML = "";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.style.cssText = `display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:8px;font-size:14px;font-weight:500;cursor:pointer;background:${bgColour};color:${textColour};border:none`;
  btn.innerHTML = bell + label;
  btn.addEventListener("click", () => {
    const listHtml = `
      <div class="space-y-1 text-sm max-h-[60vh] overflow-y-auto">
        ${hard
          .map(
            (
              v,
            ) => `<div class="flex items-center gap-2 text-red-700 bg-red-50 px-3 py-1.5 rounded">
          <span class="font-bold text-xs">HARD</span> ${v.message}
        </div>`,
          )
          .join("")}
        ${soft
          .map(
            (
              v,
            ) => `<div class="flex items-center gap-2 text-yellow-700 bg-yellow-50 px-3 py-1.5 rounded">
          <span class="font-bold text-xs">SOFT</span> ${v.message}
        </div>`,
          )
          .join("")}
      </div>`;
    showModal(`Validation — ${violations.length} issues`, listHtml, {
      showCancel: false,
      confirmText: "Close",
    });
  });
  area.appendChild(btn);
}

export { currentSession };
