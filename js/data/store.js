/**
 * Central state store with pub/sub and undo/redo.
 * Still to work on this to add more features like selective undo, but it does the basics for now.
 */

const MAX_UNDO = 50;

const defaultState = () => ({
  competition: {
    name: "",
    days: 4,
    teamsPerSession: 4,
    floorPerSession: 3,
    wsos_weights: { 1: 5, 2: 5, 3: 25, 4: 25, 5: 40 },
  },
  experts: [],
  marking_scheme: {
    modules: [],
  },
  sessions: {},
});

/** Generate session keys based on competition days */
function generateSessions(days) {
  const sessions = {};
  for (let d = 1; d <= days; d++) {
    sessions[`C${d}-AM`] = createEmptySession();
    sessions[`C${d}-PM`] = createEmptySession();
  }
  return sessions;
}

function createEmptySession() {
  return {
    teams: [],
    floor: [],
    free: [],
  };
}

function createEmptyTeam(id, name) {
  return {
    id,
    name,
    sub_criteria: [],
    lead: null,
    experts: [],
    observers: [],
  };
}

class Store {
  constructor() {
    this._state = defaultState();
    this._subscribers = new Map();
    this._undoStack = [];
    this._redoStack = [];
    this._batchDepth = 0;
    this._batchPaths = new Set();

    // Auto-restore from localStorage
    try {
      const saved = localStorage.getItem("eap_state");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.competition) {
          this._state = parsed;
        }
      }
    } catch (e) {
      /* ignore corrupt data */
    }
  }

  /** Get current state (read-only reference) */
  get state() {
    return this._state;
  }

  /** Deep clone state for snapshots */
  _clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /** Save undo snapshot before mutation */
  _saveUndo() {
    this._undoStack.push(this._clone(this._state));
    if (this._undoStack.length > MAX_UNDO) {
      this._undoStack.shift();
    }
    this._redoStack = [];
  }

  /** Undo last change */
  undo() {
    if (this._undoStack.length === 0) return false;
    this._redoStack.push(this._clone(this._state));
    this._state = this._undoStack.pop();
    this._notify("*");
    return true;
  }

  /** Redo last undone change */
  redo() {
    if (this._redoStack.length === 0) return false;
    this._undoStack.push(this._clone(this._state));
    this._state = this._redoStack.pop();
    this._notify("*");
    return true;
  }

  get canUndo() {
    return this._undoStack.length > 0;
  }

  get canRedo() {
    return this._redoStack.length > 0;
  }

  /**
   * Begin a batch of mutations — only one undo snapshot is saved,
   * and subscribers are notified once at the end.
   */
  beginBatch() {
    if (this._batchDepth === 0) {
      this._saveUndo();
      this._batchPaths.clear();
    }
    this._batchDepth++;
  }

  endBatch() {
    this._batchDepth--;
    if (this._batchDepth === 0) {
      for (const path of this._batchPaths) {
        this._notify(path);
      }
      this._batchPaths.clear();
    }
  }

  /**
   * Update state at a given path.
   * @param {string} path - dot-separated path e.g. 'competition.name', 'experts', 'sessions.C1-PM'
   * @param {*} value - new value
   */
  set(path, value) {
    if (this._batchDepth === 0) {
      this._saveUndo();
    }

    const parts = path.split(".");
    let obj = this._state;
    for (let i = 0; i < parts.length - 1; i++) {
      obj = obj[parts[i]];
    }
    obj[parts[parts.length - 1]] = value;

    if (this._batchDepth > 0) {
      this._batchPaths.add(path.split(".")[0]);
    } else {
      this._notify(path.split(".")[0]);
    }
  }

  /**
   * Replace entire state (e.g. from JSON load).
   */
  loadState(newState) {
    this._saveUndo();
    this._state = newState;
    this._notify("*");
  }

  /**
   * Reset to defaults and initialise sessions.
   */
  initCompetition(name, days, teamsPerSession, floorPerSession) {
    this._saveUndo();
    this._state.competition.name = name;
    this._state.competition.days = days;
    this._state.competition.teamsPerSession = teamsPerSession || 4;
    this._state.competition.floorPerSession = floorPerSession || 3;
    this._state.sessions = generateSessions(days);

    // Create teams for each session
    const sessionKeys = Object.keys(this._state.sessions);
    for (const key of sessionKeys) {
      const session = this._state.sessions[key];
      session.teams = [];
      for (let t = 1; t <= this._state.competition.teamsPerSession; t++) {
        session.teams.push(createEmptyTeam(`team-${t}`, `Team ${t}`));
      }
      // All experts start as free in each session
      session.free = this._state.experts.map((e) => e.id);
      session.floor = [];
    }

    this._notify("*");
  }

  /** Rebuild sessions when team count changes */
  updateTeamCount(count) {
    this._saveUndo();
    this._state.competition.teamsPerSession = count;
    for (const key of Object.keys(this._state.sessions)) {
      const session = this._state.sessions[key];
      // Add teams if needed
      while (session.teams.length < count) {
        const t = session.teams.length + 1;
        session.teams.push(createEmptyTeam(`team-${t}`, `Team ${t}`));
      }
      // Remove teams if needed (move experts to free)
      while (session.teams.length > count) {
        const removed = session.teams.pop();
        if (removed.lead) session.free.push(removed.lead);
        session.free.push(...removed.experts);
      }
    }
    this._notify("*");
  }

  // --- Expert mutations ---

  setExperts(experts) {
    this._saveUndo();
    this._state.experts = experts;

    // Sync: add any new experts to 'free' pool in all sessions,
    // remove any deleted experts from all sessions
    const expertIds = new Set(experts.map((e) => e.id));
    for (const key of Object.keys(this._state.sessions)) {
      const session = this._state.sessions[key];
      if (!session) continue;

      // Remove deleted experts from all lists
      session.free = session.free.filter((id) => expertIds.has(id));
      session.floor = session.floor.filter((id) => expertIds.has(id));
      for (const team of session.teams) {
        if (team.lead && !expertIds.has(team.lead)) team.lead = null;
        team.experts = team.experts.filter((id) => expertIds.has(id));
        team.observers = (team.observers || []).filter((id) =>
          expertIds.has(id),
        );
      }

      // Find experts not assigned anywhere in this session
      const assigned = new Set([...session.free, ...session.floor]);
      for (const team of session.teams) {
        if (team.lead) assigned.add(team.lead);
        team.experts.forEach((id) => assigned.add(id));
        (team.observers || []).forEach((id) => assigned.add(id));
      }

      // Add missing experts to free pool
      for (const id of expertIds) {
        if (!assigned.has(id)) {
          session.free.push(id);
        }
      }
    }

    this._notify("experts");
    this._notify("sessions");
  }

  // --- Allocation mutations ---

  /**
   * Move an expert to a new role within a session.
   * @param {string} sessionKey - e.g. 'C1-PM'
   * @param {string} expertId - expert country code
   * @param {'free'|'floor'|'lead'|'expert'} targetRole
   * @param {string} [targetTeamId] - required if targetRole is 'lead' or 'expert'
   */
  moveExpert(sessionKey, expertId, targetRole, targetTeamId) {
    this._saveUndo();
    const session = this._state.sessions[sessionKey];
    if (!session) return;

    const expert = this.getExpert(expertId);
    const isObserver = expert && expert.is_observer_only;

    // Remove from current position
    this._removeExpertFromSession(session, expertId);

    // Add to new position
    switch (targetRole) {
      case "free":
        session.free.push(expertId);
        break;
      case "floor":
        session.floor.push(expertId);
        break;
      case "lead": {
        // Observers cannot be lead
        if (isObserver) {
          // Put them as observer on the team instead
          const team = session.teams.find((t) => t.id === targetTeamId);
          if (team) {
            team.observers.push(expertId);
          }
          break;
        }
        const team = session.teams.find((t) => t.id === targetTeamId);
        if (team) {
          if (team.lead) {
            session.free.push(team.lead);
          }
          team.lead = expertId;
        }
        break;
      }
      case "expert": {
        const team = session.teams.find((t) => t.id === targetTeamId);
        if (team) {
          // Goes as observer if: flagged observer, or team already has 3 experts
          if (isObserver || team.experts.length >= 3) {
            team.observers.push(expertId);
          } else {
            team.experts.push(expertId);
          }
        }
        break;
      }
    }

    this._notify("sessions");
  }

  _removeExpertFromSession(session, expertId) {
    // Remove from free
    session.free = session.free.filter((id) => id !== expertId);
    // Remove from floor
    session.floor = session.floor.filter((id) => id !== expertId);
    // Remove from teams
    for (const team of session.teams) {
      if (team.lead === expertId) {
        team.lead = null;
      }
      team.experts = team.experts.filter((id) => id !== expertId);
      team.observers = team.observers.filter((id) => id !== expertId);
    }
  }

  // --- Sub-criteria mutations ---

  assignSubCriteria(sessionKey, teamId, subCriteriaIds) {
    this._saveUndo();
    const session = this._state.sessions[sessionKey];
    if (!session) return;
    const team = session.teams.find((t) => t.id === teamId);
    if (team) {
      team.sub_criteria = subCriteriaIds;
    }
    this._notify("sessions");
  }

  // --- Marking scheme criteria ---

  setMarkingScheme(scheme) {
    this._saveUndo();
    this._state.marking_scheme = scheme;
    this._notify("marking_scheme");
  }

  // --- Pub/Sub ---

  /**
   * Subscribe to state changes.
   * @param {string} path - top-level key to watch ('experts', 'sessions', 'competition', 'marking_scheme', '*' for all)
   * @param {Function} callback
   * @returns {Function} unsubscribe function
   */
  subscribe(path, callback) {
    if (!this._subscribers.has(path)) {
      this._subscribers.set(path, new Set());
    }
    this._subscribers.get(path).add(callback);
    return () => this._subscribers.get(path)?.delete(callback);
  }

  _notify(path) {
    if (path === "*") {
      // Wildcard: notify all subscribers
      for (const [, cbs] of this._subscribers) {
        for (const cb of cbs) cb(this._state);
      }
    } else {
      // Notify specific subscribers
      if (this._subscribers.has(path)) {
        for (const cb of this._subscribers.get(path)) cb(this._state);
      }
      // Notify wildcard subscribers
      if (this._subscribers.has("*")) {
        for (const cb of this._subscribers.get("*")) cb(this._state);
      }
    }

    // Auto-save to localStorage (only if there's data worth saving)
    try {
      if (this._state.experts.length > 0 || this._state.competition.name) {
        localStorage.setItem("eap_state", JSON.stringify(this._state));
      }
    } catch (e) {
      /* storage full or unavailable */
    }
  }

  /** Export state as JSON string */
  toJSON() {
    return JSON.stringify(this._state, null, 2);
  }

  /** Get all session keys in order */
  getSessionKeys() {
    return Object.keys(this._state.sessions).sort((a, b) => {
      const [, da, pa] = a.match(/C(\d+)-(\w+)/);
      const [, db, pb] = b.match(/C(\d+)-(\w+)/);
      if (da !== db) return da - db;
      return pa === "AM" ? -1 : 1;
    });
  }

  /** Get marking session keys (exclude C1-AM which is floor-only) */
  getMarkingSessionKeys() {
    return this.getSessionKeys().filter((k) => k !== "C1-AM");
  }

  /** Look up expert by ID */
  getExpert(id) {
    return this._state.experts.find((e) => e.id === id);
  }

  /** Get expert's role in a session */
  getExpertRole(sessionKey, expertId) {
    const session = this._state.sessions[sessionKey];
    if (!session) return null;
    if (session.free.includes(expertId)) return { role: "free" };
    if (session.floor.includes(expertId)) return { role: "floor" };
    for (const team of session.teams) {
      if (team.lead === expertId)
        return { role: "lead", team: team.id, teamName: team.name };
      if (team.experts.includes(expertId))
        return { role: "expert", team: team.id, teamName: team.name };
      if (team.observers.includes(expertId))
        return { role: "observer", team: team.id, teamName: team.name };
    }
    return { role: "free" }; // default
  }
}

// Singleton
const store = new Store();
export default store;
