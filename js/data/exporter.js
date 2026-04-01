/**
 * JSON save/load for full application state.
 */
import store from './store.js';
import { readFileAsText } from '../shared.js';

/**
 * Save current state to a JSON file download.
 */
export function saveToJSON() {
  const json = store.toJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const name = store.state.competition.name || 'allocation';
  a.download = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${getDateStamp()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Load state from a JSON file input.
 */
export async function loadFromJSON(file) {
  const text = await readFileAsText(file);
  const state = JSON.parse(text);
  if (!state.competition || !state.experts || !state.sessions) {
    throw new Error('Invalid save file: missing required fields.');
  }
  store.loadState(state);
  return state;
}

function getDateStamp() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Generate a plain-text summary for copying into spreadsheets.
 */
