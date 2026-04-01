/**
 * Marking Scheme / Modules page — manual entry of modules and sub-criteria.
 * Defines modules (A,B,C etc.) and sub-criteria (A1, A2, A3 etc.) here.
 *
 * Modules have a primary skill area (DI/FE/BE/Mixed) used by the allocator
 * to match experts to teams based on their skill profile.
 *
 * Sub-criteria are assigned to specific sessions (e.g. C1-PM, C2-AM).
 * They are later distributed across teams on the Sub-criteria page.
 */
import store from "../data/store.js";
import {
  showToast,
  showModal,
  SKILL_BG,
  SKILL_FULL_NAME,
} from "./components.js";

// Skill area options for module primary skill dropdown
const SKILL_OPTIONS = [
  { value: "di", label: "Design Implementation (DI)", colour: SKILL_BG.di },
  { value: "fe", label: "Front-end Development (FE)", colour: SKILL_BG.fe },
  { value: "be", label: "Back-end Development (BE)", colour: SKILL_BG.be },
  { value: "mixed", label: "Mixed", colour: SKILL_BG.mixed },
];

let _unsubscribe = null;

export function render(container) {
  if (_unsubscribe) {
    _unsubscribe();
    _unsubscribe = null;
  }
  container.innerHTML = `
    <div class="p-6 max-w-7xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold">Marking Scheme</h1>
        <button id="btn-add-module" class="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
          + Add Module
        </button>
      </div>

      <p class="text-sm text-gray-500 mb-4">Define modules and sub-criteria for this competition. Each module represents a test project that experts will mark.</p>

      <div id="modules-summary" class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"></div>
      <div id="modules-container" class="space-y-4"></div>
    </div>`;

  container
    .querySelector("#btn-add-module")
    .addEventListener("click", () => showAddModuleDialog());
  _unsubscribe = store.subscribe("marking_scheme", () =>
    renderModules(container),
  );
  renderModules(container);
}

/**
 * Show add/edit module dialog.
 * When editing, the ID field is read-only.
 */
function showAddModuleDialog(existing = null) {
  const isEdit = !!existing;
  const nextId = existing?.id || getNextModuleId();

  const html = `
    <div class="space-y-4">
      <div class="grid grid-cols-4 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">ID</label>
          <input type="text" id="mod-id" value="${nextId}" maxlength="2"
            class="w-full px-3 py-2 border rounded-lg text-sm font-mono font-bold text-center ${isEdit ? "bg-gray-100" : ""}" ${isEdit ? "readonly" : ""} />
        </div>
        <div class="col-span-3">
          <label class="block text-sm font-medium mb-1">Module Name</label>
          <input type="text" id="mod-name" value="${existing?.name || ""}" placeholder="e.g. REST API, Static Website Design"
            class="w-full px-3 py-2 border rounded-lg text-sm" />
        </div>
      </div>
      <div>
        <label class="block text-sm font-medium mb-1">Primary Skill Area</label>
        <select id="mod-skill" class="w-full px-3 py-2 border rounded-lg text-sm">
          ${SKILL_OPTIONS.map((s) => `<option value="${s.value}" ${existing?.primary_skill === s.value ? "selected" : ""}>${s.label}</option>`).join("")}
        </select>
      </div>
    </div>`;

  showModal(isEdit ? `Edit Module ${existing.id}` : "Add Module", html, {
    confirmText: isEdit ? "Update" : "Add",
    onConfirm: () => {
      const id = document.getElementById("mod-id").value.trim().toUpperCase();
      const name = document.getElementById("mod-name").value.trim();
      const skill = document.getElementById("mod-skill").value;

      if (!id || !name) {
        showToast("Module ID and name are required", "error");
        return false;
      }

      const scheme = { ...store.state.marking_scheme };
      const modules = [...(scheme.modules || [])];

      if (isEdit) {
        const idx = modules.findIndex((m) => m.id === id);
        if (idx >= 0) {
          modules[idx] = { ...modules[idx], name, primary_skill: skill };
        }
      } else {
        if (modules.find((m) => m.id === id)) {
          showToast(`Module ${id} already exists`, "error");
          return false;
        }
        modules.push({
          id,
          name,
          total_marks: 0,
          primary_skill: skill,
          sub_criteria: [],
          skill_breakdown: {},
        });
      }

      scheme.modules = modules;
      store.setMarkingScheme(scheme);
      showToast(
        isEdit ? `Module ${id} updated` : `Module ${id} added`,
        "success",
      );
      return true;
    },
  });
}

/**
 * Batch-add sub-criteria to a module.
 * Generates sequential IDs (e.g. A1, A2, A3) and assigns them
 * all to the same session. Includes a live preview.
 */
function showBatchAddSubCriteria(moduleId) {
  const mod = store.state.marking_scheme.modules.find((m) => m.id === moduleId);
  if (!mod) return;

  const days = store.state.competition.days || 4;
  const existingCount = mod.sub_criteria.length;

  const html = `
    <div class="space-y-4">
      <p class="text-sm text-gray-500">Quickly add multiple sub-criteria to <strong>Module ${moduleId}</strong>. They will be numbered ${moduleId}${existingCount + 1}, ${moduleId}${existingCount + 2}, etc.</p>
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">How many?</label>
          <input type="number" id="batch-count" value="3" min="1" max="20"
            class="w-full px-3 py-2 border rounded-lg text-sm font-bold text-center" />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Session</label>
          <select id="batch-session" class="w-full px-3 py-2 border rounded-lg text-sm">
            ${buildSessionOptions(days)}
          </select>
        </div>
      </div>
      <div id="batch-preview" class="bg-gray-50 rounded-lg p-3 text-sm"></div>
    </div>`;

  const modal = showModal(`Add Sub-criteria to ${moduleId}`, html, {
    confirmText: "Add All",
    onConfirm: () => {
      const count = parseInt(document.getElementById("batch-count").value) || 0;
      const sessionVal = document.getElementById("batch-session").value;
      const [dayStr, half] = sessionVal.split("-");
      const day = parseInt(dayStr) || 1;

      if (count < 1) {
        showToast("Enter at least 1", "error");
        return false;
      }

      // Immutable update: clone scheme → module → sub_criteria
      const scheme = { ...store.state.marking_scheme };
      const modules = [...scheme.modules];
      const modIdx = modules.findIndex((m) => m.id === moduleId);
      if (modIdx < 0) return;

      const mod = { ...modules[modIdx] };
      const subs = [...mod.sub_criteria];
      let added = 0;

      for (let i = 1; i <= count; i++) {
        const num = existingCount + i;
        const id = `${moduleId}${num}`;
        if (!subs.find((s) => s.id === id)) {
          subs.push({
            id,
            name: "",
            day_of_marking: day,
            session_half: half,
            total_marks: 0,
            aspects: [],
            wsos_breakdown: {},
          });
          added++;
        }
      }

      mod.sub_criteria = subs;
      modules[modIdx] = mod;
      scheme.modules = modules;
      store.setMarkingScheme(scheme);
      showToast(`Added ${added} sub-criteria to ${moduleId}`, "success");
      return true;
    },
  });

  // Live preview — updates as count/session inputs change
  function updatePreview() {
    const count = parseInt(modal.querySelector("#batch-count")?.value) || 0;
    const sessionVal = modal.querySelector("#batch-session")?.value || "";
    const preview = modal.querySelector("#batch-preview");
    if (!preview) return;

    const ids = [];
    for (let i = 1; i <= Math.min(count, 20); i++) {
      ids.push(`${moduleId}${existingCount + i}`);
    }
    preview.innerHTML =
      ids.length > 0
        ? `<span class="text-xs text-gray-500">Will create:</span> <span class="font-mono text-xs">${ids.join(", ")}</span> <span class="text-xs text-blue-600">@ ${sessionVal.replace("-", " → C")}</span>`
        : '<span class="text-xs text-gray-500">Enter a count</span>';
  }

  modal.querySelector("#batch-count")?.addEventListener("input", updatePreview);
  modal
    .querySelector("#batch-session")
    ?.addEventListener("change", updatePreview);
  updatePreview();
}

/** Edit a single sub-criterion's session assignment. */
function showEditSubCriterionDialog(moduleId, existing) {
  const days = store.state.competition.days || 4;
  const existingSession = `${existing.day_of_marking}-${existing.session_half || "AM"}`;

  const html = `
    <div class="space-y-4">
      <div class="grid grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium mb-1">ID</label>
          <input type="text" value="${existing.id}" class="w-full px-3 py-2 border rounded-lg text-sm font-mono font-bold bg-gray-100" readonly />
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Session</label>
          <select class="edit-sc-session w-full px-3 py-2 border rounded-lg text-sm">
            ${buildSessionOptions(days, existingSession)}
          </select>
        </div>
      </div>
    </div>`;

  const modal = showModal(`Edit ${existing.id}`, html, {
    confirmText: "Update",
    onConfirm: () => {
      const selectEl = modal.querySelector(".edit-sc-session");
      if (!selectEl) return true;
      const sessionVal = selectEl.value;
      const [dayStr, half] = sessionVal.split("-");
      const day = parseInt(dayStr) || 1;

      const scheme = { ...store.state.marking_scheme };
      const modules = [...scheme.modules];
      const modIdx = modules.findIndex((m) => m.id === moduleId);
      if (modIdx < 0) return true;

      const mod = { ...modules[modIdx] };
      const subs = [...mod.sub_criteria];
      const scIdx = subs.findIndex((s) => s.id === existing.id);
      if (scIdx >= 0) {
        subs[scIdx] = {
          ...subs[scIdx],
          day_of_marking: day,
          session_half: half,
        };
      }

      mod.sub_criteria = subs;
      modules[modIdx] = mod;
      scheme.modules = modules;
      store.setMarkingScheme(scheme);
      showToast(`${existing.id} updated to C${day}-${half}`, "success");
      return true;
    },
  });
}

/** Build <option> elements for session selector (e.g. C1-AM, C1-PM, C2-AM...). */
function buildSessionOptions(days, selectedValue) {
  let html = "";
  for (let d = 1; d <= days; d++) {
    for (const half of ["AM", "PM"]) {
      const val = `${d}-${half}`;
      const label = `C${d}-${half}`;
      html += `<option value="${val}" ${selectedValue === val ? "selected" : ""}>${label}</option>`;
    }
  }
  return html;
}

function deleteModule(moduleId) {
  const scheme = { ...store.state.marking_scheme };
  scheme.modules = scheme.modules.filter((m) => m.id !== moduleId);
  store.setMarkingScheme(scheme);
  showToast(`Module ${moduleId} deleted`, "info");
}

function deleteSubCriterion(moduleId, scId) {
  const scheme = { ...store.state.marking_scheme };
  const modules = [...scheme.modules];
  const modIdx = modules.findIndex((m) => m.id === moduleId);
  if (modIdx < 0) return;
  const mod = { ...modules[modIdx] };
  mod.sub_criteria = mod.sub_criteria.filter((s) => s.id !== scId);
  modules[modIdx] = mod;
  scheme.modules = modules;
  store.setMarkingScheme(scheme);
  showToast(`${scId} deleted`, "info");
}

/** Render module cards + summary stats. Wires up all event handlers via delegation. */
function renderModules(container) {
  const mc = container.querySelector("#modules-container");
  if (!mc) return;
  const summaryEl = container.querySelector("#modules-summary");
  const scheme = store.state.marking_scheme;

  if (!scheme || !scheme.modules || scheme.modules.length === 0) {
    mc.innerHTML = `<div class="text-center py-12 text-gray-500">
      <p class="text-lg">No modules defined</p>
      <p class="text-sm mt-1">Click "Add Module" to define the competition's test projects</p>
    </div>`;
    summaryEl.innerHTML = "";
    return;
  }

  const totalSC = scheme.modules.reduce((s, m) => s + m.sub_criteria.length, 0);

  summaryEl.innerHTML = `
    <div class="bg-white rounded-lg border p-3 text-center">
      <div class="text-2xl font-bold">${scheme.modules.length}</div>
      <div class="text-xs text-gray-500">Modules</div>
    </div>
    <div class="bg-white rounded-lg border p-3 text-center">
      <div class="text-2xl font-bold">${totalSC}</div>
      <div class="text-xs text-gray-500">Sub-criteria</div>
    </div>
    <div class="bg-white rounded-lg border p-3 text-center">
      <div class="text-2xl font-bold">${store.state.competition.days || "?"}</div>
      <div class="text-xs text-gray-500">Competition Days</div>
    </div>`;

  mc.innerHTML = scheme.modules.map((mod) => renderModuleCard(mod)).join("");

  // Wire event handlers for edit/delete/add buttons
  mc.querySelectorAll(".btn-edit-module").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mod = scheme.modules.find((m) => m.id === btn.dataset.id);
      if (mod) showAddModuleDialog(mod);
    });
  });
  mc.querySelectorAll(".btn-delete-module").forEach((btn) => {
    btn.addEventListener("click", () => deleteModule(btn.dataset.id));
  });
  mc.querySelectorAll(".btn-add-sc").forEach((btn) => {
    btn.addEventListener("click", () =>
      showBatchAddSubCriteria(btn.dataset.moduleId),
    );
  });
  mc.querySelectorAll(".btn-edit-sc").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mod = scheme.modules.find((m) => m.id === btn.dataset.moduleId);
      const sc = mod?.sub_criteria.find((s) => s.id === btn.dataset.scId);
      if (sc) showEditSubCriterionDialog(btn.dataset.moduleId, sc);
    });
  });
  mc.querySelectorAll(".btn-delete-sc").forEach((btn) => {
    btn.addEventListener("click", () =>
      deleteSubCriterion(btn.dataset.moduleId, btn.dataset.scId),
    );
  });
}

/** Format sub-criterion session as "C1-PM" etc. */
function formatSession(sc) {
  const day = sc.day_of_marking || 1;
  const half = sc.session_half || "AM";
  return `C${day}-${half}`;
}

/** Render a single module card with its sub-criteria chips. */
function renderModuleCard(mod) {
  const skillClass = SKILL_BG[mod.primary_skill] || SKILL_BG.mixed;
  const skillName = SKILL_FULL_NAME[mod.primary_skill] || "Mixed";

  return `
    <div class="module-card bg-white rounded-xl border shadow-sm overflow-hidden">
      <div class="px-4 py-3 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <span class="text-xl font-bold text-gray-500">${mod.id}</span>
          <div>
            <div class="font-semibold">${mod.name}</div>
            <div class="text-xs text-gray-500">${mod.sub_criteria.length} sub-criteria</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <span class="px-2 py-1 rounded text-xs font-medium border ${skillClass}">${skillName}</span>
          <button class="btn-edit-module text-xs text-gray-700 hover:text-blue-700" data-id="${mod.id}" title="Edit module">Edit</button>
          <button class="btn-delete-module text-xs text-gray-700 hover:text-red-700" data-id="${mod.id}" title="Delete module">Delete</button>
        </div>
      </div>

      <div class="px-4 py-3 border-t bg-gray-50/50">
        <div class="flex flex-wrap items-center gap-1.5">
          ${mod.sub_criteria
            .map(
              (sc) => `
            <div class="group inline-flex items-center gap-1 bg-white border rounded-lg px-2 py-1 text-xs hover:shadow-sm transition-shadow">
              <span class="font-mono font-bold">${sc.id}</span>
              <span class="text-blue-600 text-xs">${formatSession(sc)}</span>
              <button class="btn-edit-sc hidden group-hover:inline text-blue-700 hover:text-blue-900 ml-0.5" data-module-id="${mod.id}" data-sc-id="${sc.id}" title="Edit">&#9998;</button>
              <button class="btn-delete-sc hidden group-hover:inline text-red-700 hover:text-red-900" data-module-id="${mod.id}" data-sc-id="${sc.id}" title="Delete">&times;</button>
            </div>
          `,
            )
            .join("")}
          <button class="btn-add-sc inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 border border-blue-200 border-dashed rounded-lg hover:bg-blue-100 transition-colors" data-module-id="${mod.id}">+ Add</button>
        </div>
      </div>
    </div>`;
}

/** Get next sequential module ID (A, B, C...). */
function getNextModuleId() {
  const modules = store.state.marking_scheme?.modules || [];
  if (modules.length === 0) return "A";
  const lastId = modules[modules.length - 1].id;
  return String.fromCharCode(lastId.charCodeAt(0) + 1);
}
