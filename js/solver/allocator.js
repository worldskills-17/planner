/**
 * Auto-allocation solver — assigns experts to teams and floor schedule.
 */
import store from "../data/store.js";
import { getTeamPrimarySkill } from "../validation/validator.js";

/**
 * Count workload per expert across all sessions except the given one.
 */
function getExpertWorkload(excludeSession) {
  const workload = {};
  for (const expert of store.state.experts) {
    workload[expert.id] = { marking: 0, floor: 0, lead: 0, free: 0, total: 0 };
  }

  for (const key of store.getSessionKeys()) {
    if (key === excludeSession) continue;
    const session = store.state.sessions[key];
    if (!session) continue;

    for (const team of session.teams) {
      if (team.lead && workload[team.lead]) {
        workload[team.lead].marking++;
        workload[team.lead].lead++;
        workload[team.lead].total++;
      }
      for (const id of team.experts) {
        if (workload[id]) {
          workload[id].marking++;
          workload[id].total++;
        }
      }
      for (const id of team.observers || []) {
        if (workload[id]) {
          workload[id].marking++;
          workload[id].total++;
        }
      }
    }
    for (const id of session.floor) {
      if (workload[id]) {
        workload[id].floor++;
        workload[id].total++;
      }
    }
  }

  return workload;
}

/**
 * Auto-allocate experts for a given session.
 */
export function autoAllocate(sessionKey) {
  const state = store.state;
  const session = state.sessions[sessionKey];
  if (!session) return;

  const allExperts = [...state.experts];
  if (allExperts.length === 0) return;

  const floorCount = state.competition.floorPerSession || 3;
  const isFloorOnly = sessionKey === "C1-AM";
  const totalSessions = store.getSessionKeys().length;
  const maxBusy = Math.max(1, totalSessions - 2); // ensure at least 2 free sessions on competition

  const workload = getExpertWorkload(sessionKey);

  // Determine who must rest
  const mustRest = new Set();
  for (const e of allExperts) {
    const wl = workload[e.id];
    if (wl && wl.total >= maxBusy) mustRest.add(e.id);
  }

  // Build result arrays
  let floor = [];
  let free = allExperts.map((e) => e.id);
  const teamResults = session.teams.map((t) => ({
    id: t.id,
    lead: null,
    experts: [],
    observers: [],
  }));

  // -- Floor selection --
  const floorPicks = selectFloorExperts(
    allExperts,
    floorCount,
    workload,
    mustRest,
  );
  floor = floorPicks.map((e) => e.id);
  const usedExperts = new Set(floor);

  if (isFloorOnly) {
    // Apply result
    free = allExperts.map((e) => e.id).filter((id) => !usedExperts.has(id));
    applyResult(sessionKey, session, floor, free, teamResults);
    return;
  }

  // Must-rest experts stay free
  for (const id of mustRest) usedExperts.add(id);

  // -- Get previous session's teams for cohesion --
  const prevSession = getPreviousSession(sessionKey);
  const prevTeams = prevSession ? prevSession.teams : [];

  // -- Lead selection --
  const leadCandidates = allExperts
    .filter(
      (e) =>
        !usedExperts.has(e.id) &&
        e.supervisor_willing !== "N" &&
        !e.is_observer_only &&
        !e.is_new,
    )
    .map((e) => ({ expert: e, score: computeLeadScore(e, workload) }))
    .sort((a, b) => b.score - a.score);

  for (let ti = 0; ti < teamResults.length; ti++) {
    const skill = getTeamPrimarySkill(session.teams[ti]) || "be";

    // Try to keep the same lead from previous session's same team index
    const prevTeam = prevTeams[ti];
    const prevLead = prevTeam?.lead;
    if (prevLead && !usedExperts.has(prevLead) && !mustRest.has(prevLead)) {
      const prevLeadExp = allExperts.find((e) => e.id === prevLead);
      if (
        prevLeadExp &&
        !prevLeadExp.is_observer_only &&
        !prevLeadExp.is_new &&
        prevLeadExp.preferences[skill] !== "N"
      ) {
        teamResults[ti].lead = prevLead;
        usedExperts.add(prevLead);
        continue;
      }
    }

    const pick =
      leadCandidates.find(
        (c) =>
          !usedExperts.has(c.expert.id) &&
          c.expert.skills[skill] >= 3 &&
          c.expert.preferences[skill] !== "N",
      ) ||
      leadCandidates.find(
        (c) =>
          !usedExperts.has(c.expert.id) && c.expert.preferences[skill] !== "N",
      );

    if (pick) {
      teamResults[ti].lead = pick.expert.id;
      usedExperts.add(pick.expert.id);
    }
  }

  // -- Expert assignment (3 per team, prefer keeping previous team together) --
  for (let ti = 0; ti < teamResults.length; ti++) {
    const skill = getTeamPrimarySkill(session.teams[ti]) || "be";
    const leadExp = teamResults[ti].lead
      ? state.experts.find((e) => e.id === teamResults[ti].lead)
      : null;
    let hasFiveStar = leadExp && leadExp.skills[skill] === 5;

    // First try to keep previous team members
    const prevTeam = prevTeams[ti];
    const prevMembers = prevTeam ? [...(prevTeam.experts || [])] : [];
    const assigned = [];

    for (const prevId of prevMembers) {
      if (assigned.length >= 3) break;
      if (usedExperts.has(prevId) || mustRest.has(prevId)) continue;
      const exp = allExperts.find((e) => e.id === prevId);
      if (!exp || exp.is_observer_only) continue;
      if (exp.preferences[skill] === "N") continue;
      assigned.push(exp);
      usedExperts.add(exp.id);
      if (exp.skills[skill] === 5) hasFiveStar = true;
    }

    // Fill remaining slots with possible candidates
    if (assigned.length < 3) {
      const scored = allExperts
        .filter(
          (e) =>
            !usedExperts.has(e.id) &&
            !e.is_observer_only &&
            e.preferences[skill] !== "N",
        )
        .map((e) => ({
          expert: e,
          score: computeExpertScore(e, skill, workload),
        }))
        .sort((a, b) => b.score - a.score);

      for (const { expert } of scored) {
        if (assigned.length >= 3) break;
        if (usedExperts.has(expert.id)) continue;

        if (!hasFiveStar && expert.skills[skill] === 5) {
          assigned.push(expert);
          usedExperts.add(expert.id);
          hasFiveStar = true;
          continue;
        }
        assigned.push(expert);
        usedExperts.add(expert.id);
      }
    }

    // Try to swap in a 5-star if missing
    if (!hasFiveStar) {
      const fiveStar = allExperts.find(
        (e) =>
          !usedExperts.has(e.id) &&
          e.skills[skill] === 5 &&
          !e.is_observer_only,
      );
      if (fiveStar && assigned.length > 0) {
        const weakest = assigned.reduce((min, e) =>
          e.skills[skill] < min.skills[skill] ? e : min,
        );
        usedExperts.delete(weakest.id);
        assigned.splice(assigned.indexOf(weakest), 1);
        assigned.push(fiveStar);
        usedExperts.add(fiveStar.id);
      }
    }

    teamResults[ti].experts = assigned.map((e) => e.id);
  }

  // Observers are NOT auto-assigned — they are added manually only

  // -- Free pool --
  free = allExperts.map((e) => e.id).filter((id) => !usedExperts.has(id));

  applyResult(sessionKey, session, floor, free, teamResults);
}

/**
 * Apply computed result to the session using store.set for reliable notification.
 */
function applyResult(sessionKey, session, floor, free, teamResults) {
  session.floor = floor;
  session.free = free;
  for (let i = 0; i < session.teams.length && i < teamResults.length; i++) {
    session.teams[i].lead = teamResults[i].lead;
    session.teams[i].experts = teamResults[i].experts;
    session.teams[i].observers = teamResults[i].observers;
  }

  // Use _saveUndo + _notify to avoid the double-undo from store.set()
  store._saveUndo();
  store._notify("sessions");
}

/**
 * Get the previous session's data (for team cohesion).
 */
function getPreviousSession(currentKey) {
  const keys = store.getSessionKeys();
  const idx = keys.indexOf(currentKey);
  if (idx <= 0) return null;
  return store.state.sessions[keys[idx - 1]] || null;
}

function selectFloorExperts(experts, count, workload, mustRest) {
  return experts
    .filter((e) => !mustRest.has(e.id))
    .map((e) => {
      const wl = workload[e.id] || { floor: 0, total: 0 };
      let score = 0;
      if (e.is_new) score += 3;
      if (e.is_observer_only) score += 2;
      const avg = (e.skills.di + e.skills.fe + e.skills.be) / 3;
      if (avg <= 2) score += 2;
      else if (avg <= 3) score += 1;
      if (wl.floor === 0) score += 2;
      score -= wl.total * 0.5;
      const nPrefs = Object.values(e.preferences).filter(
        (p) => p === "N",
      ).length;
      score += nPrefs * 0.5;
      return { expert: e, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((s) => s.expert);
}

function computeLeadScore(expert, workload) {
  const wl = workload[expert.id] || { lead: 0, marking: 0 };
  const avg = (expert.skills.di + expert.skills.fe + expert.skills.be) / 3;
  let score = avg * 2;
  if (expert.supervisor_willing === "Y") score += 2;
  else if (expert.supervisor_willing === "M") score += 1;
  score -= wl.lead * 1.5;
  score -= wl.marking * 0.5;
  return score;
}

function computeExpertScore(expert, primarySkill, workload) {
  const wl = workload[expert.id] || { marking: 0, free: 0 };
  let score = (expert.skills[primarySkill] / 5) * 3;
  const pref = expert.preferences[primarySkill];
  if (pref === "Y") score += 3;
  else if (pref === "M") score += 1;
  score -= wl.marking * 0.8;
  score += expert.is_new ? 0.2 : 0.5;
  return score;
}

/**
 * Auto-allocate ALL sessions for optimal rotation.
 */
export function autoAllocateAll() {
  const sessionKeys = store.getSessionKeys();
  for (const key of sessionKeys) {
    autoAllocate(key);
  }
}
