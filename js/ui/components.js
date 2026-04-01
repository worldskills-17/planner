/**
 * Shared UI components: modals, toasts, skill badges, drag-drop helpers.
 */
import {
  SKILL_COLOURS,
  SKILL_LABELS,
  SKILL_SHORT,
  PREF_LABELS,
  PREF_STYLES,
  ROLE_COLOURS,
  SKILL_BG,
  SKILL_FULL_NAME,
} from "../shared.js";

// Re-export for backward compatibility with existing imports
export { SKILL_BG, SKILL_FULL_NAME };

// --- Flag helper ---

/**
 * Return an <img> tag for a country flag, falling back to placeholder.
 */
export function flagImg(countryCode, size = "w-6 h-4") {
  const cc = (countryCode || "").toUpperCase();
  return `<img src="img/flags/${cc}.svg" alt="${cc}" class="${size} inline-block rounded-sm object-cover shadow-sm" onerror="this.src='img/flags/flag-placeholder.svg'" />`;
}

/**
 * Create a skill badge element.
 */
export function skillBadge(skill, value) {
  const c = SKILL_COLOURS[value] || SKILL_COLOURS[0];
  return `<span class="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium" style="${c.style}" title="${SKILL_LABELS[skill]}: ${value}/5">${SKILL_LABELS[skill]} ${value}</span>`;
}

/**
 * Render interactive star rating (clickable).
 */
export function editableStarRating(expertId, skill, value, max = 5) {
  const skillName = SKILL_LABELS[skill] || skill;
  let stars = "";
  for (let i = 1; i <= max; i++) {
    const cls = i <= value ? "star-filled" : "star-empty";
    stars += `<button type="button" class="star-btn ${cls} cursor-pointer hover:scale-110 transition-transform"
      data-expert-id="${expertId}" data-skill="${skill}" data-value="${i}" aria-label="${skillName} rating ${i} of ${max}" title="${skillName}: ${i}/${max}"></button>`;
  }
  return `<span class="inline-flex gap-0.5 items-center" role="group" aria-label="${skillName} skill rating">${stars}</span>`;
}

/**
 * Render an expert card (compact, draggable).
 */
export function expertCard(expert, options = {}) {
  const {
    draggable = true,
    showPrefs = true,
    compact = false,
    role = "",
  } = options;
  if (!expert) return "";

  const roleClass = ROLE_COLOURS[role] || ROLE_COLOURS.free;
  const dragAttr = draggable
    ? `draggable="true" data-expert-id="${expert.id}"`
    : "";
  const roleLabel =
    role === "lead"
      ? '<span class="text-xs font-bold text-amber-700 ml-1">SUPERVISOR</span>'
      : "";
  const newBadge = expert.is_new
    ? '<span class="text-xs bg-blue-100 text-blue-700 px-1 rounded">NEW</span>'
    : "";
  const obsBadge = expert.is_observer_only
    ? '<span class="text-xs bg-gray-200 text-gray-800 px-1 rounded">OBS</span>'
    : "";

  // Mini skill dots for compact view
  const miniSkills =
    `<span class="inline-flex gap-0.5 ml-auto shrink-0" title="DI:${expert.skills.di} FE:${expert.skills.fe} BE:${expert.skills.be}">` +
    miniSkillDot("di", expert.skills.di) +
    miniSkillDot("fe", expert.skills.fe) +
    miniSkillDot("be", expert.skills.be) +
    "</span>";

  const prefPills = `<span class="inline-flex gap-0.5">${prefPill("di", expert.preferences.di)}${prefPill("fe", expert.preferences.fe)}${prefPill("be", expert.preferences.be)}</span>`;

  if (compact) {
    return `<div class="expert-card border rounded-lg px-3 py-2 cursor-grab ${roleClass}" ${dragAttr}>
      <div class="flex items-center gap-2">
        ${flagImg(expert.country_code, "w-7 h-5")}
        <span class="font-mono font-bold text-sm">${expert.country_code}</span>
        <span class="truncate font-medium text-sm">${expert.name}</span>
        ${roleLabel}${newBadge}${obsBadge}
      </div>
      <div class="flex items-center justify-between mt-1">
        ${prefPills}
        ${miniSkills}
      </div>
    </div>`;
  }

  return `<div class="expert-card border rounded-lg px-3 py-2 cursor-grab ${roleClass} shadow-sm hover:shadow-md transition-shadow" ${dragAttr}>
    <div class="flex items-center justify-between gap-2">
      <div class="flex items-center gap-2 min-w-0">
        ${flagImg(expert.country_code, "w-6 h-4")}
        <span class="font-mono font-bold text-sm bg-gray-100 px-1.5 py-0.5 rounded">${expert.country_code}</span>
        <span class="font-medium truncate">${expert.name}</span>
        ${roleLabel}${newBadge}${obsBadge}
      </div>
    </div>
    <div class="flex items-center gap-2 mt-1.5">
      <div class="flex gap-1">${skillBadge("di", expert.skills.di)}${skillBadge("fe", expert.skills.fe)}${skillBadge("be", expert.skills.be)}</div>
      ${showPrefs ? `<div class="flex gap-1.5 ml-auto">${prefPill("di", expert.preferences.di)}${prefPill("fe", expert.preferences.fe)}${prefPill("be", expert.preferences.be)}</div>` : ""}
    </div>
  </div>`;
}

// --- Drag and Drop ---

let draggedExpertId = null;

export function initDragDrop(container) {
  // Find the nearest drop zone — either a .drop-zone or any [data-drop-zone]
  function findDropTarget(el) {
    return el.closest("[data-drop-zone]");
  }

  container.addEventListener("dragstart", (e) => {
    const card = e.target.closest(".expert-card");
    if (!card) return;
    draggedExpertId = card.dataset.expertId;
    card.classList.add("opacity-50");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", draggedExpertId);

    // Highlight all drop zones
    container.querySelectorAll("[data-drop-zone]").forEach((zone) => {
      zone.classList.add("drop-highlight");
    });
  });

  container.addEventListener("dragend", (e) => {
    const card = e.target.closest(".expert-card");
    if (card) card.classList.remove("opacity-50");
    draggedExpertId = null;

    container.querySelectorAll("[data-drop-zone]").forEach((zone) => {
      zone.classList.remove("drop-highlight", "drop-active");
    });
  });

  container.addEventListener("dragover", (e) => {
    const zone = findDropTarget(e.target);
    if (zone) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      zone.classList.add("drop-active");
    }
  });

  container.addEventListener("dragleave", (e) => {
    const zone = findDropTarget(e.target);
    if (zone && !zone.contains(e.relatedTarget)) {
      zone.classList.remove("drop-active");
    }
  });

  container.addEventListener("drop", (e) => {
    const zone = findDropTarget(e.target);
    if (!zone) return;
    e.preventDefault();
    zone.classList.remove("drop-active");

    const expertId = e.dataTransfer.getData("text/plain");
    if (!expertId) return;

    // Fire custom event with drop details
    const dropEvent = new CustomEvent("expert-drop", {
      bubbles: true,
      detail: {
        expertId,
        zoneId: zone.dataset.dropZone,
        zoneType: zone.dataset.accept,
      },
    });
    zone.dispatchEvent(dropEvent);
  });
}

// --- Toast notifications ---

let toastContainer = null;

export function showToast(message, type = "info", duration = 3000) {
  if (!toastContainer) {
    toastContainer = document.createElement("div");
    toastContainer.className =
      "fixed bottom-4 right-4 z-50 flex flex-col gap-2";
    document.body.appendChild(toastContainer);
  }

  const colours = {
    info: "bg-blue-600",
    success: "bg-emerald-600",
    warning: "bg-yellow-500 text-gray-900",
    error: "bg-red-600",
  };

  const toast = document.createElement("div");
  toast.className = `${colours[type] || colours.info} text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium transform transition-all duration-300 translate-y-2 opacity-0`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  });

  setTimeout(() => {
    toast.classList.add("translate-y-2", "opacity-0");
    setTimeout(() => {
      toast.remove();
      if (toastContainer && toastContainer.children.length === 0) {
        toastContainer.remove();
        toastContainer = null;
      }
    }, 300);
  }, duration);
}

// --- Modal ---

export function showModal(title, contentHtml, options = {}) {
  const {
    onConfirm,
    onCancel,
    confirmText = "Confirm",
    cancelText = "Cancel",
    showCancel = true,
    wide = false,
  } = options;

  const maxWidth = wide ? "max-w-5xl" : "max-w-lg";

  const overlay = document.createElement("div");
  overlay.className =
    "fixed inset-0 bg-black/50 z-40 flex items-center justify-center p-4";

  overlay.innerHTML = `
    <div class="bg-white rounded-xl shadow-2xl ${maxWidth} w-full max-h-[85vh] overflow-auto">
      <div class="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 class="text-lg font-semibold">${title}</h3>
        <button class="modal-close w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors text-xl leading-none" aria-label="Close">&times;</button>
      </div>
      <div class="px-6 py-4">${contentHtml}</div>
      <div class="px-6 py-3 border-t border-gray-200 flex justify-end gap-3">
        <button class="modal-cancel px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200">${cancelText}</button>
        <button class="modal-confirm px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700">${confirmText}</button>
      </div>
    </div>`;

  overlay.querySelector(".modal-confirm")?.addEventListener("click", () => {
    // onConfirm can return false to prevent closing (for validation)
    const result = onConfirm?.();
    if (result !== false) {
      overlay.remove();
    }
  });

  overlay.querySelector(".modal-cancel")?.addEventListener("click", () => {
    overlay.remove();
    onCancel?.();
  });

  overlay.querySelector(".modal-close")?.addEventListener("click", () => {
    overlay.remove();
    onCancel?.();
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.remove();
      onCancel?.();
    }
  });

  document.body.appendChild(overlay);
  return overlay;
}

/**
 * Preference pill —  green=Y, yellow=M, red=N, grey=Obs.
 */
function prefPill(skill, pref) {
  const style = PREF_STYLES[pref] || PREF_STYLES.Observer;
  return `<span class="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold" style="${style}" title="${SKILL_LABELS[skill]} pref: ${PREF_LABELS[pref] || pref}">${SKILL_LABELS[skill]}</span>`;
}

/**
 * Mini coloured dot showing skill level (for compact cards).
 */
function miniSkillDot(skill, value) {
  const c = SKILL_COLOURS[value] || SKILL_COLOURS[0];
  return `<span class="inline-flex items-center justify-center w-6 h-6 rounded text-xs font-bold" style="${c.style}" title="${SKILL_LABELS[skill]}: ${value}" aria-hidden="true">${SKILL_SHORT[skill]}${value}</span>`;
}

/**
 * Generate an SVG radar/spider chart for a team's skill profile.
 * @param {Object} skills - { di: avg, fe: avg, be: avg }
 * @param {number} size - SVG size in px
 */
export function teamRadarChart(skills, size = 120) {
  // Use a wider viewBox but shorter height to crop top/bottom whitespace
  const aspect = 0.78; // height ratio — less than 1 crops vertical space
  const vw = size,
    vh = size * aspect;
  const cx = vw / 2,
    cy = vh / 2 + vh * 0.04;
  const r = Math.min(vw, vh) * 0.34;

  // Three axes: DI (top), FE (bottom-right), BE (bottom-left)
  const angles = [-Math.PI / 2, Math.PI / 6, (Math.PI * 5) / 6];
  const labels = [
    { text: "DI", val: skills.di || 0 },
    { text: "FE", val: skills.fe || 0 },
    { text: "BE", val: skills.be || 0 },
  ];
  const colours = ["#7c3aed", "#0ea5e9", "#f59e0b"];

  // Max area background (5/5/5 triangle)
  const maxPts = angles
    .map((a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`)
    .join(" ");
  const maxBg = `<polygon points="${maxPts}" fill="#f3f4f6" stroke="#d1d5db" stroke-width="1"/>`;

  // Background grid rings
  let gridLines = "";
  for (let ring = 1; ring <= 5; ring++) {
    const ringR = r * (ring / 5);
    const pts = angles
      .map((a) => `${cx + ringR * Math.cos(a)},${cy + ringR * Math.sin(a)}`)
      .join(" ");
    gridLines += `<polygon points="${pts}" fill="none" stroke="#e5e7eb" stroke-width="0.5"/>`;
  }

  // Axis lines
  let axisLines = "";
  for (const a of angles) {
    axisLines += `<line x1="${cx}" y1="${cy}" x2="${cx + r * Math.cos(a)}" y2="${cy + r * Math.sin(a)}" stroke="#d1d5db" stroke-width="0.5"/>`;
  }

  // Data polygon
  const dataPts = labels
    .map((l, i) => {
      const dist = r * (l.val / 5);
      return `${cx + dist * Math.cos(angles[i])},${cy + dist * Math.sin(angles[i])}`;
    })
    .join(" ");

  // Labels — offset further from dots (more padding at small sizes)
  const labelOffset = r + Math.max(14, size * 0.06);
  const fontSize = Math.max(9, size * 0.026);
  const labelEls = labels
    .map((l, i) => {
      const lx = cx + labelOffset * Math.cos(angles[i]);
      const ly = cy + labelOffset * Math.sin(angles[i]);
      return `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" fill="${colours[i]}" font-size="${fontSize}" font-weight="600">${l.text} ${l.val.toFixed(1)}</text>`;
    })
    .join("");

  // Dots
  const dotR = Math.max(3, size * 0.014);
  const dots = labels
    .map((l, i) => {
      const dist = r * (l.val / 5);
      return `<circle cx="${cx + dist * Math.cos(angles[i])}" cy="${cy + dist * Math.sin(angles[i])}" r="${dotR}" fill="${colours[i]}"/>`;
    })
    .join("");

  const strokeW = Math.max(1, size * 0.005);
  return `<svg width="${vw}" height="${vh}" viewBox="0 0 ${vw} ${vh}" class="inline-block">
    ${maxBg}${gridLines}${axisLines}
    <polygon points="${dataPts}" fill="rgba(59,130,246,0.15)" stroke="#3b82f6" stroke-width="${strokeW}"/>
    ${dots}${labelEls}
  </svg>`;
}
