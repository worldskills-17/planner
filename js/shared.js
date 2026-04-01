/**
 * Shared constants and utilities used across the application.
 * Centralises colour schemes, labels, and common helper functions.
 */
import store from './data/store.js';

// --- Skill Labels & Full Names ---

export const SKILL_LABELS = { di: 'DI', fe: 'FE', be: 'BE' };
export const SKILL_FULL_NAME = { di: 'Design Implementation', fe: 'Frontend', be: 'Backend', mixed: 'Mixed' };
export const SKILL_SHORT = { di: 'D', fe: 'F', be: 'B' };

// --- Skill Level Colours (WCAG AA+ compliant) ---

export const SKILL_COLOURS = {
  5: { style: 'background:#1b5e20;color:#fff', label: 'Expert' },
  4: { style: 'background:#66bb6a;color:#000', label: 'Strong' },
  3: { style: 'background:#ffd600;color:#000', label: 'Average' },
  2: { style: 'background:#e08300;color:#000', label: 'Basic' },
  1: { style: 'background:#b00020;color:#fff', label: 'Low' },
  0: { style: 'background:#e5e7eb;color:#374151', label: 'None' },
};

// --- Preference Labels & Colours ---

export const PREF_OPTIONS = ['Y', 'N', 'M', 'Observer'];
export const PREF_LABELS = { Y: 'Yes', N: 'No', M: 'Maybe', Observer: 'Obs' };
export const PREF_STYLES = {
  Y: 'background:#d1fae5;color:#065f46;border:1px solid #6ee7b7',
  M: 'background:#fef9c3;color:#854d0e;border:1px solid #fcd34d',
  N: 'background:#fee2e2;color:#991b1b;border:1px solid #fca5a5',
  Observer: 'background:#e5e7eb;color:#374151;border:1px solid #d1d5db',
};
export const PREF_CLASS = {
  Y: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  N: 'bg-red-100 text-red-900 border-red-300',
  M: 'bg-yellow-100 text-yellow-900 border-yellow-300',
  Observer: 'bg-gray-100 text-gray-700 border-gray-300',
};

// --- Role Colours ---

export const ROLE_COLOURS = {
  lead: 'border-amber-400 bg-amber-50',
  expert: 'border-blue-200 bg-blue-50',
  floor: 'border-purple-300 bg-purple-50',
  free: 'border-gray-200 bg-gray-50',
};

// --- Skill Area Badge Colours (used by modules/criteria pages) ---

export const SKILL_BG = {
  di: 'bg-violet-100 text-violet-800 border-violet-300',
  fe: 'bg-sky-100 text-sky-800 border-sky-300',
  be: 'bg-amber-100 text-amber-800 border-amber-300',
  mixed: 'bg-gray-100 text-gray-800 border-gray-300',
};

// --- Score Box Colours (for modal avg display) ---

export const SCORE_COLOURS = [
  { min: 0, bg: '#e5e7eb', text: '#374151', border: '#d1d5db' },
  { min: 1, bg: '#fee2e2', text: '#b00020', border: '#fca5a5' },
  { min: 2, bg: '#fff3e0', text: '#e08300', border: '#ffcc80' },
  { min: 3, bg: '#fffde7', text: '#000000', border: '#ffd600' },
  { min: 4, bg: '#e8f5e9', text: '#000000', border: '#66bb6a' },
  { min: 5, bg: '#e8f5e9', text: '#1b5e20', border: '#1b5e20' },
];

// --- Helpers ---

/** Resolve an array of expert IDs to expert objects, filtering out missing ones. */
export function resolveExperts(ids) {
  return ids.map(id => store.getExpert(id)).filter(Boolean);
}

/** Get all team members (lead + experts) as expert objects. */
export function getTeamMembers(team) {
  const members = resolveExperts(team.experts);
  const lead = team.lead ? store.getExpert(team.lead) : null;
  if (lead) members.push(lead);
  return members;
}

/** Calculate average skills for an array of expert objects. */
export function calcSkillAvg(experts) {
  if (experts.length === 0) return { di: 0, fe: 0, be: 0 };
  return {
    di: experts.reduce((s, e) => s + e.skills.di, 0) / experts.length,
    fe: experts.reduce((s, e) => s + e.skills.fe, 0) / experts.length,
    be: experts.reduce((s, e) => s + e.skills.be, 0) / experts.length,
  };
}

/** Check if an expert's preferences make them observer-only. */
export function isObserverOnly(expert) {
  return Object.values(expert.preferences).every(p => p === 'Observer');
}

/** Read a file as text via FileReader (returns Promise). */
export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsText(file);
  });
}

/** Get the score colour for a given average value (0-5). */
export function getScoreColour(value) {
  const level = Math.min(5, Math.max(0, Math.round(value)));
  return SCORE_COLOURS[level];
}
