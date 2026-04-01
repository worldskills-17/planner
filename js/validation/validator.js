/**
 * Constraint validation engine.
 * Returns arrays of violations: { type: 'hard'|'soft', code, message, session, team, expert }
 */
import store from "../data/store.js";

/**
 * Validate a single session.
 */
export function validateSession(sessionKey) {
  const violations = [];
  const session = store.state.sessions[sessionKey];
  if (!session) return violations;

  const isMarkingSession = sessionKey !== "C1-AM";

  if (isMarkingSession) {
    for (const team of session.teams) {
      violations.push(...validateTeam(sessionKey, team));
    }

    // Check for dual assignment (same expert on floor AND in a team)
    violations.push(...checkDualAssignment(sessionKey, session));
  }

  return violations;
}

/**
 * Validate a single team within a session.
 */
function validateTeam(sessionKey, team) {
  const violations = [];
  const state = store.state;

  // Get all team members
  const memberIds = [...team.experts];
  if (team.lead) memberIds.push(team.lead);

  // --- HARD CONSTRAINTS ---

  // 1. Team size: must be exactly 4 (1 lead + 3 experts)
  if (memberIds.length > 0) {
    if (!team.lead) {
      violations.push({
        type: "hard",
        code: "NO_LEAD",
        message: `${team.name} has no Marking Supervisor`,
        session: sessionKey,
        team: team.id,
      });
    }
    if (team.experts.length !== 3) {
      violations.push({
        type: "hard",
        code: "TEAM_SIZE",
        message: `${team.name} has ${team.experts.length} experts (need 3)`,
        session: sessionKey,
        team: team.id,
      });
    }
  }

  // 2. Five-star requirement: at least one member with 5 in primary skill
  if (team.sub_criteria.length > 0 && memberIds.length > 0) {
    const primarySkill = getTeamPrimarySkill(team);
    if (primarySkill) {
      const hasFiveStar = memberIds.some((id) => {
        const expert = state.experts.find((e) => e.id === id);
        return expert && expert.skills[primarySkill] === 5;
      });
      if (!hasFiveStar) {
        violations.push({
          type: "hard",
          code: "NO_FIVE_STAR",
          message: `${team.name} has no 5-star expert in ${primarySkill.toUpperCase()}`,
          session: sessionKey,
          team: team.id,
        });
      }
    }
  }

  // 3. Observers CAN be on teams (they observe the marking process)
  // No hard constraint — observers are allowed in teams

  // --- SOFT CONSTRAINTS ---

  // 1. Team average in each skill area
  if (memberIds.length >= 2) {
    for (const skill of ["di", "fe", "be"]) {
      const avg =
        memberIds.reduce((sum, id) => {
          const expert = state.experts.find((e) => e.id === id);
          return sum + (expert ? expert.skills[skill] : 0);
        }, 0) / memberIds.length;

      if (avg < 3) {
        violations.push({
          type: "soft",
          code: "LOW_TEAM_AVG",
          message: `${team.name} avg ${skill.toUpperCase()} is ${avg.toFixed(1)} (below 3.0)`,
          session: sessionKey,
          team: team.id,
        });
      }
    }
  }

  // 2. Preference conflicts
  for (const id of memberIds) {
    const expert = state.experts.find((e) => e.id === id);
    if (!expert) continue;
    const primarySkill = getTeamPrimarySkill(team);
    if (primarySkill && expert.preferences[primarySkill] === "N") {
      violations.push({
        type: "soft",
        code: "PREF_CONFLICT",
        message: `${expert.name} (${id}) prefers NOT to mark ${primarySkill.toUpperCase()} but is in ${team.name}`,
        session: sessionKey,
        team: team.id,
        expert: id,
      });
    }
  }

  // 3. Balance new/experienced
  const newCount = memberIds.filter((id) => {
    const expert = state.experts.find((e) => e.id === id);
    return expert && expert.is_new;
  }).length;
  if (newCount >= 2 && newCount > memberIds.length / 2) {
    violations.push({
      type: "soft",
      code: "TOO_MANY_NEW",
      message: `${team.name} has ${newCount} new experts (consider mixing with experienced)`,
      session: sessionKey,
      team: team.id,
    });
  }

  return violations;
}

/**
 * Check for dual assignment: same expert on floor AND in a marking team.
 */
function checkDualAssignment(sessionKey, session) {
  const violations = [];
  const floorSet = new Set(session.floor);

  for (const team of session.teams) {
    const memberIds = [...team.experts];
    if (team.lead) memberIds.push(team.lead);

    for (const id of memberIds) {
      if (floorSet.has(id)) {
        const expert = store.state.experts.find((e) => e.id === id);
        violations.push({
          type: "hard",
          code: "DUAL_ASSIGNMENT",
          message: `${expert?.name || id} is on floor AND in ${team.name}`,
          session: sessionKey,
          team: team.id,
          expert: id,
        });
      }
    }
  }

  return violations;
}

/**
 * Determine the primary skill area a team should focus on,
 * based on their assigned sub-criteria.
 */
function getTeamPrimarySkill(team) {
  if (!team.sub_criteria || team.sub_criteria.length === 0) return null;

  const scheme = store.state.marking_scheme;
  if (!scheme || !scheme.modules) return null;

  // Tally WSOS breakdown from assigned sub-criteria
  const totals = { di: 0, fe: 0, be: 0 };
  for (const scId of team.sub_criteria) {
    for (const mod of scheme.modules) {
      const sc = mod.sub_criteria.find((s) => s.id === scId);
      if (sc) {
        totals.di += sc.wsos_breakdown?.di || 0;
        totals.fe += sc.wsos_breakdown?.fe || 0;
        totals.be += sc.wsos_breakdown?.be || 0;
        break;
      }
    }
  }

  const max = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  return max[0]?.[1] > 0 ? max[0][0] : null;
}

export { getTeamPrimarySkill };
