function calculateMatchupStats(matchupData) {
  if (!matchupData || !Array.isArray(matchupData.teams) || matchupData.teams.length !== 2) {
    throw new Error("Invalid matchup data: expected two teams");
  }
  const [teamA, teamB] = matchupData.teams;
  const scoreA = Number(teamA.score) || 0;
  const scoreB = Number(teamB.score) || 0;
  let winnerId = null;
  let loserId = null;
  let isTie = false;
  if (scoreA > scoreB) {
    winnerId = teamA.id;
    loserId = teamB.id;
  } else if (scoreB > scoreA) {
    winnerId = teamB.id;
    loserId = teamA.id;
  } else {
    isTie = true;
  }
  return {
    teamAScore: scoreA,
    teamBScore: scoreB,
    winnerId,
    loserId,
    isTie,
    pointDifference: Math.abs(scoreA - scoreB)
  };
}

function renderMatchup(matchupData) {
  const stats = calculateMatchupStats(matchupData);
  const container = document.createElement("article");
  container.className = "matchup-card";
  if (matchupData.id != null) {
    container.dataset.matchupId = matchupData.id;
  }

  const header = document.createElement("h3");
  const date = matchupData.date ? new Date(matchupData.date) : null;
  header.textContent = date && !isNaN(date.getTime())
    ? date.toLocaleDateString()
    : "Matchup";
  container.appendChild(header);

  const teamsContainer = document.createElement("div");
  teamsContainer.className = "teams";
  matchupData.teams.forEach((team, index) => {
    const teamEl = document.createElement("div");
    teamEl.className = "team";

    const nameEl = document.createElement("span");
    nameEl.className = "team-name";
    nameEl.textContent = team.name || "Unknown";

    const scoreEl = document.createElement("span");
    scoreEl.className = "team-score";
    const score = index === 0 ? stats.teamAScore : stats.teamBScore;
    scoreEl.textContent = score;

    if (stats.isTie) {
      teamEl.classList.add("tie");
    } else if (team.id === stats.winnerId) {
      teamEl.classList.add("winner");
    } else {
      teamEl.classList.add("loser");
    }

    teamEl.appendChild(nameEl);
    teamEl.appendChild(scoreEl);
    teamsContainer.appendChild(teamEl);
  });
  container.appendChild(teamsContainer);

  const footer = document.createElement("div");
  footer.className = "matchup-stats";
  footer.textContent = stats.isTie
    ? "Tie Game"
    : `Won by ${stats.pointDifference} point${stats.pointDifference === 1 ? "" : "s"}`;
  container.appendChild(footer);

  return container;
}

function filterMatchups(matchups, criteria = {}) {
  if (!Array.isArray(matchups)) {
    throw new Error("matchups should be an array");
  }
  const { teamId, startDate, endDate, minScore, maxScore, winnerId, customFilter } = criteria;

  return matchups.filter(matchup => {
    try {
      const stats = calculateMatchupStats(matchup);

      if (teamId != null) {
        const ids = matchup.teams.map(t => t.id);
        if (!ids.includes(teamId)) return false;
      }

      if (winnerId != null && stats.winnerId !== winnerId) {
        return false;
      }

      if (startDate) {
        const d = new Date(matchup.date);
        if (isNaN(d.getTime()) || d < new Date(startDate)) return false;
      }

      if (endDate) {
        const d = new Date(matchup.date);
        if (isNaN(d.getTime()) || d > new Date(endDate)) return false;
      }

      if (minScore != null) {
        const highestScore = Math.max(stats.teamAScore, stats.teamBScore);
        if (highestScore < minScore) return false;
      }

      if (maxScore != null) {
        const highestScore = Math.max(stats.teamAScore, stats.teamBScore);
        if (highestScore > maxScore) return false;
      }

      if (typeof customFilter === "function" && !customFilter(matchup, stats)) {
        return false;
      }

      return true;
    } catch (error) {
      console.error("Error processing matchup in filterMatchups:", error, matchup);
      return false;
    }
  });
}

export { calculateMatchupStats, renderMatchup, filterMatchups };