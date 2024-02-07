const { connection, connectPromise } = require('./databaseConnection');
const { getStatsForPlayer, getInfoForPlayer} = require("./retrieve-statistics"); // Adjust the path as necessary

async function getYardsPerCarry(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['RushingYards', 'RushingAttempts'])
        .then(stats => {
            if (stats && stats.RushingYards !== undefined && stats.RushingAttempts !== undefined)
                return stats.RushingYards / Math.max(stats.RushingAttempts, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getCompletionPercentage(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['PassingCompletions', 'PassingAttempts'])
        .then(stats => {
            if (stats && stats.PassingCompletions !== undefined && stats.PassingAttempts !== undefined)
                return stats.PassingCompletions / Math.max(stats.PassingAttempts, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getPassingYardsPerGame(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['PassingYards'])
        .then(stats => {
            if (stats && stats.PassingYards)
                return stats.PassingYards / Math.max(stats.GamesPlayed, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getTDINTRatio(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['PassingTouchdowns', 'PassingInterceptions'])
        .then(stats => {
            if (stats && stats.PassingTouchdowns && stats.PassingInterceptions)
                return stats.PassingTouchdowns / Math.max(stats.PassingInterceptions, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getQBR(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['PassingAttempts', 'PassingCompletions', 'PassingYards', 'PassingTouchdowns', 'PassingInterceptions'])
        .then(stats => {
            if (stats) {
                const attempts = stats.PassingAttempts || 0;
                const completions = stats.PassingCompletions || 0;
                const yards = stats.PassingYards || 0;
                const touchdowns = stats.PassingTouchdowns || 0;
                const interceptions = stats.PassingInterceptions || 0;

                if (attempts > 0) {
                    const a = Math.max(0, Math.min((((completions / attempts) * 100) - 30) / 20, 2.375));
                    const b = Math.max(0, Math.min((yards / attempts - 3) / 4, 2.375));
                    const c = Math.max(0, Math.min((touchdowns / attempts) * 20, 2.375));
                    const d = Math.max(0, Math.min(2.375 - ((interceptions / attempts) * 25), 2.375));

                    return ((a + b + c + d) / 6) * 100;
                }
            }
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getRushingYardsPerGame(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['RushingYards'])
        .then(stats => {
            if (stats && stats.RushingYards)
                return stats.RushingYards / Math.max(stats.GamesPlayed, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getRushingTDsPerGame(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['RushingTDs'])
        .then(stats => {
            if (stats && stats.RushingTDs)
                return stats.RushingTDs / Math.max(stats.GamesPlayed, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getPassingTDsPerGame(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['PassingTouchdowns'])
        .then(stats => {
            if (stats && stats.PassingTouchdowns)
                return stats.PassingTouchdowns / Math.max(stats.GamesPlayed, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getFumblesPerGame(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['Fumbles'])
        .then(stats => {
            if (stats && stats.Fumbles)
                return stats.Fumbles / Math.max(stats.GamesPlayed, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getReceptionsPerGame(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['Receptions'])
        .then(stats => {
            if (stats && stats.Receptions)
                return stats.Receptions / Math.max(stats.GamesPlayed, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getReceivingYardsPerGame(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['ReceivingYards'])
        .then(stats => {
            if (stats && stats.ReceivingYards)
                return stats.ReceivingYards / Math.max(stats.GamesPlayed, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getReceivingTDsPerGame(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['ReceivingTDs'])
        .then(stats => {
            if (stats && stats.ReceivingTDs)
                return stats.ReceivingTDs / Math.max(stats.GamesPlayed, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getReceivingYardsPerCatch(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['ReceivingYards', 'Receptions'])
        .then(stats => {
            if (stats && stats.ReceivingYards && stats.Receptions)
                return stats.ReceivingYards / Math.max(stats.Receptions, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getTacklesPerGame(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['Combined'])
        .then(stats => {
            if (stats && stats.Combined)
                return stats.Combined / Math.max(stats.GamesPlayed, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getSacksPerGame(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['Sacks'])
        .then(stats => {
            if (stats && stats.Sacks)
                return stats.Sacks / Math.max(stats.GamesPlayed, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getInterceptionsPerGame(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['Interceptions'])
        .then(stats => {
            if (stats && stats.Interceptions)
                return stats.Interceptions / Math.max(stats.GamesPlayed, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getPassesDefendedPerGame(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['PassesDefended'])
        .then(stats => {
            if (stats && stats.PassesDefended)
                return stats.PassesDefended / Math.max(stats.GamesPlayed, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getForcedFumblesPerGame(playerId, year, week, period) {
    return getStatsForPlayer(playerId, year, week, period, ['ForcedFumbles'])
        .then(stats => {
            if (stats && stats.ForcedFumbles)
                return stats.ForcedFumbles / Math.max(stats.GamesPlayed, 1);
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getRecruitingScore(playerId) {
    return getInfoForPlayer(playerId, 'RecruitingScore')
        .then(stats => {
            if (stats && stats.RecruitingScore)
                return stats.RecruitingScore;
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function logStats() {
    let ypc = await getRecruitingScore('8a9f69c8-954d-4f97-acd8-6b1db734b370');
    console.log(`Stat: ${ypc}`);
}

logStats();

module.exports = { getYardsPerCarry };