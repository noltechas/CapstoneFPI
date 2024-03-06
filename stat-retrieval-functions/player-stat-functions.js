const { connection, connectPromise } = require('./databaseConnection');
const { getStatsForPlayer, getInfoForPlayer, getStatsForTeam, getFBSFCSForTeam, getFCSFBSOpponentRatio, getTeamWL, getTeamSOR, getTeamRoster, getTeamStats,
    getPlayerStats, getMatchupTeams
} = require("./retrieve-statistics");
const process = require("process"); // Adjust the path as necessary

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

async function getTeamYardsPerPlay(teamId, year, week, period) {
    return getStatsForTeam(teamId, year, week, period, ['AvgGain'])
        .then(stats => {
            if (stats && stats.AvgGain && stats.GamesPlayed) {
                return stats.AvgGain / stats.GamesPlayed;
            }
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getTeamYardsPerGame(teamId, year, week, period) {
    return getStatsForTeam(teamId, year, week, period, ['TotalYards'])
        .then(stats => {
            if (stats && stats.TotalYards && stats.GamesPlayed) {
                return stats.TotalYards / stats.GamesPlayed;
            }
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getTeamTurnoversPerGame(teamId, year, week, period) {
    return getStatsForTeam(teamId, year, week, period, ['Turnovers'])
        .then(stats => {
            if (stats && stats.Turnovers && stats.GamesPlayed) {
                return stats.Turnovers / stats.GamesPlayed;
            }
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getTeamPenaltiesPerGame(teamId, year, week, period) {
    return getStatsForTeam(teamId, year, week, period, ['Penalties'])
        .then(stats => {
            if (stats && stats.Penalties && stats.GamesPlayed) {
                return stats.Penalties / stats.GamesPlayed;
            }
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getTeamThirdDownSuccessRate(teamId, year, week, period) {
    return getStatsForTeam(teamId, year, week, period, ['ThirdDownSuccesses', 'ThirdDownAttempts'])
        .then(stats => {
            if (stats && stats.ThirdDownSuccesses && stats.ThirdDownAttempts && stats.GamesPlayed) {
                return stats.ThirdDownSuccesses / stats.ThirdDownAttempts;
            }
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getTeamRedZoneSuccessRate(teamId, year, week, period) {
    return getStatsForTeam(teamId, year, week, period, ['RedZoneSuccesses', 'RedZoneAttempts'])
        .then(stats => {
            if (stats && stats.RedZoneSuccesses && stats.RedZoneAttempts && stats.GamesPlayed) {
                return stats.RedZoneSuccesses / stats.RedZoneAttempts;
            }
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getTeamForcedFumblesPerGame(teamId, year, week, period) {
    return getStatsForTeam(teamId, year, week, period, ['ForcedFumbles'])
        .then(stats => {
            if (stats && stats.ForcedFumbles && stats.GamesPlayed) {
                return stats.ForcedFumbles / stats.GamesPlayed;
            }
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getTeamSacksPerGame(teamId, year, week, period) {
    return getStatsForTeam(teamId, year, week, period, ['Sacks'])
        .then(stats => {
            if (stats && stats.Sacks && stats.GamesPlayed) {
                return stats.Sacks / stats.GamesPlayed;
            }
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getTeamInterceptionsPerGame(teamId, year, week, period) {
    return getStatsForTeam(teamId, year, week, period, ['Interceptions'])
        .then(stats => {
            if (stats && stats.Interceptions && stats.GamesPlayed) {
                return stats.Interceptions / stats.GamesPlayed;
            }
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getTeamPointsPerGame(teamId, year, week, period) {
    return getStatsForTeam(teamId, year, week, period, ['Points'])
        .then(stats => {
            if (stats && stats.Points && stats.GamesPlayed) {
                return stats.Points / stats.GamesPlayed;
            }
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getTeamOpponentPointsPerGame(teamId, year, week, period) {
    return getStatsForTeam(teamId, year, week, period, ['OpponentPoints'])
        .then(stats => {
            if (stats && stats.OpponentPoints && stats.GamesPlayed) {
                return stats.OpponentPoints / stats.GamesPlayed;
            }
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getTeamOpponentYardsPerGame(teamId, year, week, period) {
    return getStatsForTeam(teamId, year, week, period, ['OpponentTotalYards'])
        .then(stats => {
            if (stats && stats.OpponentTotalYards && stats.GamesPlayed) {
                return stats.OpponentTotalYards / stats.GamesPlayed;
            }
            return 0;
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getDivisionForTeam(teamId) {
    return getFBSFCSForTeam(teamId)
        .then(divisionInfo => {
            if (divisionInfo) {
                return divisionInfo.Division;
            } else {
                console.log('Team not found or does not have a division.');
            }
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getFBSRatioForTeam(teamId, year, week, period) {
    return getFCSFBSOpponentRatio(teamId, year, week, period)
        .then(opponentRatio => {
            if (opponentRatio !== undefined) {
                return opponentRatio;
            } else {
                console.log('Team not found or no games played.');
                return 0;
            }
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getTeamWinPercentage(teamId, year, week, period) {
    return getTeamWL(teamId, year, week, period)
        .then(record => {
            const totalGames = record.Wins + record.Losses + record.Draws;
            if (totalGames > 0) {
                return record.Wins / totalGames;
            }
            return 0; // Return 0 if no games were played
        })
        .catch(error => {
            console.error('Error:', error);
            return 0;
        });
}

async function getSORForTeam(teamId, year, week, period) {
    return getTeamSOR(teamId, year, week, period)
        .then(SOR => {
            return SOR;
        })
        .catch(error => {
            console.error('Error calculating SOR:', error);
            return 0;
        });
}

async function getTeamRosterForSeason(teamId, year, period) {
    try {
        const roster = await getTeamRoster(teamId, year, period);
        // Convert the roster to a JSON string before returning
        return JSON.stringify(roster);
    } catch (error) {
        console.error('Error retrieving team roster:', error);
        // Return an empty array or appropriate error message in JSON format
        return JSON.stringify([]);
    }
}

async function getTeamStatsForPeriod(teamId, year, week, period) {
    try {
        const stats = await getTeamStats(teamId, year, week, period);
        if (stats) {
            //console.log(stats);
            return stats;
        } else {
            console.log('No stats found for the specified parameters.');
            return null;
        }
    } catch (error) {
        console.error('Error retrieving team stats:', error);
        return null;
    }
}

async function getPlayerStatsForPeriod(playerIds, year, week, period) {
    try {
        const stats = await getPlayerStats(playerIds, year, week, period);
        if (stats) {
            return stats;
        } else {
            console.log('No stats found for the specified parameters.');
            return null;
        }
    } catch (error) {
        console.error('Error retrieving team stats:', error);
        return null;
    }
}

async function getMatchupInfo(gameID) {
    try {
        const matchupInfo = await getMatchupTeams(gameID);
        if (matchupInfo) {
            // Stringify the JavaScript object to a JSON string
            return JSON.stringify(matchupInfo);
        } else {
            console.log('No matchup information found for the specified GameID.');
            return null;
        }
    } catch (error) {
        console.error('Error retrieving matchup information:', error);
        return null;
    }
}

async function logStats() {
    let stat = await getPlayerStatsForPeriod(["8a9f69c8-954d-4f97-acd8-6b1db734b370","","4ccebbe3-60e5-4c12-b1c9-ed9aaed3131c","2dc8bd1b-6d0a-45c7-ae34-1f719ebb4ed1","dcb8b276-c202-401d-a77f-d418a6c9fd91","a0f5f3c8-7ee7-4aa3-882a-f826e7bb08eb","fdb835ad-1ffe-4e21-96eb-8f3a6b8b29aa","3df3b9b4-3ee8-4ad7-bf29-67ef11f81de4","3b1b3235-35b2-4f75-b73a-37c4077d67c9","11e84799-6c1f-4f1f-bb84-236220b11d73","e971beb8-c06d-452f-af09-6afbb5b69666","0460cca3-7a2f-47db-a841-b086d92369ce","33c9690c-9228-4cdb-a5c2-ac0d3b10e750","8013844d-a7d7-4820-888c-792e7c745325","1d0c1d7d-d87a-4b1f-a75a-706a1bdcc381","e750f539-d40d-4571-806a-ba35e12fd9f9","2cc3eeb8-4b8f-4e1c-aef4-f17eff5e2176","cc5e0f4c-b7d2-44e8-951e-bd6d98ffe016","17e84fbf-b67a-4826-ada6-5c6a7fed017f","9450489d-5e4d-4745-bdc6-7cc5d47f7a3f","bc0c5268-a42a-4994-aaf5-49f8938fc6e7","48d367c0-ed2f-40cc-88f1-ddaeecbae1e2","b5c1ba28-cf40-403a-bc54-768b918b5b2b","30fe07ec-7458-4107-b228-aea17902f1be","17936af5-4717-4f1c-a06d-e7f1f969c836","40eeb538-41e3-4fe3-ab4f-ea1e61f1fcb8","320a1942-e2f9-467f-986d-a2f00bae7a47","caa785d2-6e25-4082-96d1-6c4cee067856",""],
        2018, 9,'season')
    console.log(stat)
}

//logStats()

async function main() {
    const args = process.argv.slice(2); // Skip node and script path arguments
    if (args.length === 0) {
        console.log("No function specified.");
        process.exit(1);
    }

    const functionName = args[0];
    const params = args.slice(1);

    try {
        let result;

        // Adding case for each function
        switch (functionName) {
            case 'getYardsPerCarry':
            case 'getCompletionPercentage':
            case 'getPassingYardsPerGame':
            case 'getTDINTRatio':
            case 'getQBR':
            case 'getRushingYardsPerGame':
            case 'getRushingTDsPerGame':
            case 'getPassingTDsPerGame':
            case 'getFumblesPerGame':
            case 'getReceptionsPerGame':
            case 'getReceivingYardsPerGame':
            case 'getReceivingTDsPerGame':
            case 'getReceivingYardsPerCatch':
            case 'getTacklesPerGame':
            case 'getSacksPerGame':
            case 'getInterceptionsPerGame':
            case 'getPassesDefendedPerGame':
            case 'getForcedFumblesPerGame':
            case 'getRecruitingScore':
            case 'getTeamYardsPerPlay':
            case 'getTeamYardsPerGame':
            case 'getTeamTurnoversPerGame':
            case 'getTeamPenaltiesPerGame':
            case 'getTeamThirdDownSuccessRate':
            case 'getTeamRedZoneSuccessRate':
            case 'getTeamForcedFumblesPerGame':
            case 'getTeamSacksPerGame':
            case 'getTeamInterceptionsPerGame':
            case 'getTeamPointsPerGame':
            case 'getTeamOpponentPointsPerGame':
            case 'getTeamOpponentYardsPerGame':
            case 'getDivisionForTeam':
            case 'getFBSRatioForTeam':
            case 'getTeamWinPercentage':
            case 'getSORForTeam':
            case 'getTeamStatsForPeriod':
            case 'getPlayerStatsForPeriod':
            case 'getMatchupInfo':
            case 'getTeamRosterForSeason':
                // Assuming each function returns a promise and takes parameters as needed
                result = await eval(functionName)(...params);
                console.log(JSON.stringify(result));
                break;
            default:
                throw new Error(`Function ${functionName} not recognized.`);
        }
        process.exit(0); // Exit successfully
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1); // Exit with error
    }
}

main();