const { Connection, Request, TYPES } = require('tedious');
const { connection, connectPromise } = require('./databaseConnection'); // Adjust the path as necessary
const sql = require('mssql'); // Import the mssql module

const getStatsForPlayer = async (playerId, year, week, period, statNames) => {
    await connectPromise;
    return new Promise((resolve, reject) => {
        let sql;
        switch (period) {
            case 'lastGame':
                sql = `SELECT TOP 1 ${statNames.join(', ')}, 1 AS GamesPlayed FROM PlayerGameStats pgs INNER JOIN Schedule s ON pgs.GameID = s.GameID WHERE pgs.PlayerID = '${playerId}' AND (s.Season < ${year} OR (s.Season = ${year} AND s.Week < ${week})) ORDER BY s.Season DESC, s.Week DESC`;
                break;
            case 'last3Games':
                sql = `SELECT ${statNames.map(stat => `SUM(${stat}) AS ${stat}`).join(', ')}, COUNT(*) AS GamesPlayed FROM (SELECT TOP 3 ${statNames.join(', ')} FROM PlayerGameStats pgs INNER JOIN Schedule s ON pgs.GameID = s.GameID WHERE pgs.PlayerID = '${playerId}' AND (s.Season < ${year} OR (s.Season = ${year} AND s.Week < ${week})) ORDER BY s.Season DESC, s.Week DESC) AS Last3Games`;
                break;
            case 'season':
                sql = `SELECT ${statNames.map(stat => `SUM(${stat}) AS ${stat}`).join(', ')}, COUNT(*) AS GamesPlayed FROM PlayerGameStats pgs INNER JOIN Schedule s ON pgs.GameID = s.GameID WHERE pgs.PlayerID = '${playerId}' AND s.Season = ${year} AND s.Week < ${week} GROUP BY pgs.PlayerID`;
                break;
            default:
                reject(new Error('Invalid period specified'));
                return;
        }

        const stats = {};
        const sqlRequest = new Request(sql, (err, rowCount, rows) => {
            if (err) {
                console.error('Error executing SQL:', err);
                reject(err);
                return;
            }
            if (rowCount === 0) {
                // Handle case with no games found
                stats['GamesPlayed'] = 0;
                resolve(stats);
                return;
            }
        });

        sqlRequest.on('row', (columns) => {
            columns.forEach((column) => {
                // Directly mapping column names to stats object
                stats[column.metadata.colName] = column.value;
            });
        });

        sqlRequest.on('requestCompleted', () => {
            // Once all rows have been processed
            resolve(stats);
        });

        connection.execSql(sqlRequest);
    });
};

const getInfoForPlayer = async (playerId, stat) => {
    await connectPromise;

    return new Promise((resolve, reject) => {
        let sql = `SELECT ${stat} FROM PLAYERS WHERE PlayerID = @PlayerID`;

        const request = new Request(sql, (err, rowCount, rows) => {
            if (err) {
                console.error('Error executing SQL:', err);
                reject(err);
                return;
            }

            if (rowCount === 0) {
                console.log(`No player found with ID: ${playerId}`);
                resolve({});
            }
        });

        const playerInfo = {};

        request.addParameter('PlayerID', TYPES.NVarChar, playerId);

        request.on('row', columns => {
            columns.forEach(column => {
                playerInfo[column.metadata.colName] = column.value;
            });
        });

        request.on('requestCompleted', () => {
            if (Object.keys(playerInfo).length > 0) {
                resolve(playerInfo);
            } else {
                resolve(null);
            }
        });

        connection.execSql(request);
    });
};

const getStatsForTeam = async (teamId, year, week, period, statNames) => {
    await connectPromise; // Make sure the database connection is established
    return new Promise((resolve, reject) => {
        // Dynamically build SELECT clauses based on home, away, or opponent status
        const selectClause = statNames.map(stat => {
            let homeStat, awayStat;
            if (stat.startsWith("Opponent")) {
                // Adjust for opponent stats (e.g., OpponentRushingYards)
                const baseStat = stat.replace("Opponent", "");
                homeStat = `SUM(CASE WHEN HomeTeamID = '${teamId}' THEN Away${baseStat} ELSE 0 END) AS ${stat}`;
                awayStat = `SUM(CASE WHEN AwayTeamID = '${teamId}' THEN Home${baseStat} ELSE 0 END) AS ${stat}`;
            } else {
                // Normal home and away stats
                homeStat = `SUM(CASE WHEN HomeTeamID = '${teamId}' THEN Home${stat} ELSE 0 END) AS Home${stat}`;
                awayStat = `SUM(CASE WHEN AwayTeamID = '${teamId}' THEN Away${stat} ELSE 0 END) AS Away${stat}`;
            }
            return `${homeStat}, ${awayStat}`;
        }).join(', ');

        let sql;
        switch (period) {
            case 'lastGame':
                sql = `SELECT TOP 1 ${selectClause}, COUNT(*) AS GamesPlayed FROM SCHEDULE WHERE (HomeTeamID = '${teamId}' OR AwayTeamID = '${teamId}') AND (Season < ${year} OR (Season = ${year} AND Week < ${week})) ORDER BY Season DESC, Week DESC`;
                break;
            case 'last3Games':
                sql = `SELECT ${selectClause}, COUNT(*) AS GamesPlayed FROM (SELECT TOP 3 * FROM SCHEDULE WHERE (HomeTeamID = '${teamId}' OR AwayTeamID = '${teamId}') AND (Season < ${year} OR (Season = ${year} AND Week < ${week})) ORDER BY Season DESC, Week DESC) AS Last3Games`;
                break;
            case 'season':
                sql = `SELECT ${selectClause}, COUNT(*) AS GamesPlayed FROM SCHEDULE WHERE (HomeTeamID = '${teamId}' OR AwayTeamID = '${teamId}') AND Season = ${year} AND Week < ${week} GROUP BY Season`;
                break;
            default:
                reject(new Error('Invalid period specified'));
                return;
        }

        const stats = {};
        const sqlRequest = new Request(sql, (err, rowCount, rows) => {
            if (err) {
                console.error('Error executing SQL:', err);
                reject(err);
                return;
            }
            if (rowCount === 0) {
                // Handle case with no games found
                stats['GamesPlayed'] = 0;
                resolve(stats);
            }
        });

        sqlRequest.on('row', (columns) => {
            columns.forEach((column) => {
                // Adjust mapping to include opponent stats
                const colName = column.metadata.colName.startsWith("Home") || column.metadata.colName.startsWith("Away") ? column.metadata.colName.substring(4) : column.metadata.colName;
                stats[colName] = (stats[colName] || 0) + column.value;
            });
        });

        sqlRequest.on('requestCompleted', () => {
            // Once all rows have been processed
            resolve(stats);
        });

        connection.execSql(sqlRequest);
    });
};

const getFBSFCSForTeam = async (teamId) => {
    await connectPromise; // Make sure the database connection is established

    return new Promise((resolve, reject) => {
        let sql = `SELECT Division FROM Teams WHERE TeamID = @TeamID`;

        const request = new Request(sql, (err, rowCount, rows) => {
            if (err) {
                console.error('Error executing SQL:', err);
                reject(err);
                return;
            }

            if (rowCount === 0) {
                console.log(`No team found with ID: ${teamId}`);
                resolve({});
            }
        });

        const teamInfo = {};

        request.addParameter('TeamID', TYPES.NVarChar, teamId);

        request.on('row', columns => {
            columns.forEach(column => {
                teamInfo[column.metadata.colName] = column.value;
            });
        });

        request.on('requestCompleted', () => {
            if (Object.keys(teamInfo).length > 0) {
                resolve(teamInfo);
            } else {
                resolve(null);
            }
        });

        connection.execSql(request);
    });
};

const getFCSFBSOpponentRatio = async (teamId, year, week, period) => {
    await connectPromise; // Ensure the database connection is established

    return new Promise((resolve, reject) => {
        let sql;

        // Dynamically adjust SQL based on period
        switch (period) {
            case 'lastGame':
                sql = `SELECT TOP 1 
                            t.Division AS OpponentDivision
                        FROM SCHEDULE s
                        LEFT JOIN Teams t ON (s.HomeTeamID = '${teamId}' AND t.TeamID = s.AwayTeamID) OR (s.AwayTeamID = '${teamId}' AND t.TeamID = s.HomeTeamID)
                        WHERE (s.HomeTeamID = '${teamId}' OR s.AwayTeamID = '${teamId}') 
                        AND (s.Season < ${year} OR (s.Season = ${year} AND s.Week < ${week}))
                        ORDER BY s.Season DESC, s.Week DESC`;
                break;
            case 'last3Games':
                sql = `SELECT 
                            t.Division AS OpponentDivision
                        FROM (SELECT TOP 3 
                                s.* 
                              FROM SCHEDULE s 
                              WHERE (s.HomeTeamID = '${teamId}' OR s.AwayTeamID = '${teamId}') 
                              AND (s.Season < ${year} OR (s.Season = ${year} AND s.Week < ${week}))
                              ORDER BY s.Season DESC, s.Week DESC) AS LastGames
                        LEFT JOIN Teams t ON (LastGames.HomeTeamID = '${teamId}' AND t.TeamID = LastGames.AwayTeamID) OR (LastGames.AwayTeamID = '${teamId}' AND t.TeamID = LastGames.HomeTeamID)`;
                break;
            case 'season':
                sql = `SELECT 
                            t.Division AS OpponentDivision
                        FROM SCHEDULE s
                        LEFT JOIN Teams t ON (s.HomeTeamID = '${teamId}' AND t.TeamID = s.AwayTeamID) OR (s.AwayTeamID = '${teamId}' AND t.TeamID = s.HomeTeamID)
                        WHERE (s.HomeTeamID = '${teamId}' OR s.AwayTeamID = '${teamId}') 
                        AND s.Season = ${year} AND s.Week < ${week}`;
                break;
            default:
                reject(new Error('Invalid period specified'));
                return;
        }

        const divisionsCount = { FBS: 0, FCS: 0 };

        const sqlRequest = new Request(sql, (err, rowCount, rows) => {
            if (err) {
                console.error('Error executing SQL:', err);
                reject(err);
                return;
            }
            if (rowCount === 0) {
                // If no games found, return a default ratio
                resolve(0);
            }
        });

        sqlRequest.on('row', columns => {
            columns.forEach(column => {
                // Increment count based on opponent division
                if(column.value === 'FBS' || column.value === 'FCS') {
                    divisionsCount[column.value]++;
                }
            });
        });

        sqlRequest.on('requestCompleted', () => {
            // Calculate ratio of FCS to total opponents (FCS+FBS)
            const totalGames = divisionsCount.FBS + divisionsCount.FCS;
            const ratio = totalGames > 0 ? divisionsCount.FCS / totalGames : 0;
            resolve(ratio);
        });

        connection.execSql(sqlRequest);
    });
};

const getTeamWL = async (teamId, year, week, period) => {
    await connectPromise; // Ensure the database connection is established

    return new Promise((resolve, reject) => {
        let sql;

        switch (period) {
            case 'lastGame':
                sql = `SELECT TOP 1 
                            CASE 
                                WHEN HomeTeamID = '${teamId}' AND HomePoints > AwayPoints THEN 'Win'
                                WHEN AwayTeamID = '${teamId}' AND AwayPoints > HomePoints THEN 'Win'
                                WHEN HomePoints = AwayPoints THEN 'Draw'
                                ELSE 'Loss'
                            END AS Result
                        FROM SCHEDULE
                        WHERE (HomeTeamID = '${teamId}' OR AwayTeamID = '${teamId}') 
                        AND (Season < ${year} OR (Season = ${year} AND Week < ${week}))
                        ORDER BY Season DESC, Week DESC`;
                break;
            case 'last3Games':
                sql = `SELECT 
                            CASE 
                                WHEN HomeTeamID = '${teamId}' AND HomePoints > AwayPoints THEN 'Win'
                                WHEN AwayTeamID = '${teamId}' AND AwayPoints > HomePoints THEN 'Win'
                                WHEN HomePoints = AwayPoints THEN 'Draw'
                                ELSE 'Loss'
                            END AS Result
                        FROM (SELECT TOP 3 * 
                              FROM SCHEDULE 
                              WHERE (HomeTeamID = '${teamId}' OR AwayTeamID = '${teamId}') 
                              AND (Season < ${year} OR (Season = ${year} AND Week < ${week}))
                              ORDER BY Season DESC, Week DESC) AS LastGames`;
                break;
            case 'season':
                sql = `SELECT 
                            CASE 
                                WHEN HomeTeamID = '${teamId}' AND HomePoints > AwayPoints THEN 'Win'
                                WHEN AwayTeamID = '${teamId}' AND AwayPoints > HomePoints THEN 'Win'
                                WHEN HomePoints = AwayPoints THEN 'Draw'
                                ELSE 'Loss'
                            END AS Result
                        FROM SCHEDULE
                        WHERE (HomeTeamID = '${teamId}' OR AwayTeamID = '${teamId}') 
                        AND Season = ${year} AND Week < ${week}`;
                break;
            default:
                reject(new Error('Invalid period specified'));
                return;
        }

        const record = { Wins: 0, Losses: 0, Draws: 0 };

        const sqlRequest = new Request(sql, (err, rowCount, rows) => {
            if (err) {
                console.error('Error executing SQL:', err);
                reject(err);
                return;
            }
            if (rowCount === 0) {
                // If no games found, return the default record
                resolve(record);
            }
        });

        sqlRequest.on('row', columns => {
            columns.forEach(column => {
                if (column.value === 'Win') {
                    record.Wins++;
                } else if (column.value === 'Loss') {
                    record.Losses++;
                } else if (column.value === 'Draw') {
                    record.Draws++;
                }
            });
        });

        sqlRequest.on('requestCompleted', () => {
            resolve(record);
        });

        connection.execSql(sqlRequest);
    });
};

const getTeamRecord = async (teamId, year, week) => {
    await connectPromise; // Ensure the database connection is established

    return new Promise((resolve, reject) => {
        // SQL query to calculate the team's record up to the specified week
        let sql = `
            SELECT 
                (CASE 
                    WHEN HomeTeamID = @TeamID AND HomePoints > AwayPoints THEN 'Win'
                    WHEN AwayTeamID = @TeamID AND AwayPoints > HomePoints THEN 'Win'
                    WHEN HomePoints = AwayPoints THEN 'Draw'
                    ELSE 'Loss'
                END) AS Result
            FROM SCHEDULE
            WHERE (HomeTeamID = @TeamID OR AwayTeamID = @TeamID) 
            AND Season = @Year 
            AND Week < @Week
        `;

        const record = { Wins: 0, Losses: 0, Draws: 0 };

        const sqlRequest = new Request(sql, (err, rowCount, rows) => {
            if (err) {
                console.error('Error executing SQL:', err);
                reject(err);
                return;
            }

            if (rowCount === 0) {
                // If no games found, return the default record
                resolve(record);
            }
        });

        // Adding parameters to prevent SQL injection
        sqlRequest.addParameter('TeamID', TYPES.NVarChar, teamId);
        sqlRequest.addParameter('Year', TYPES.Int, year);
        sqlRequest.addParameter('Week', TYPES.Int, week);

        sqlRequest.on('row', (columns) => {
            columns.forEach((column) => {
                if (column.value === 'Win') {
                    record.Wins++;
                } else if (column.value === 'Loss') {
                    record.Losses++;
                } else if (column.value === 'Draw') {
                    record.Draws++;
                }
            });
        });

        sqlRequest.on('requestCompleted', () => {
            resolve(record);
        });

        connection.execSql(sqlRequest);
    });
};

const getTeamSOR = async (teamId, year, week, period) => {
    await connectPromise; // Ensure the database connection is established

    return new Promise((resolve, reject) => {
        let sql = `
            SELECT 
                CASE 
                    WHEN HomeTeamID = @TeamID THEN AwayTeamID
                    WHEN AwayTeamID = @TeamID THEN HomeTeamID
                END AS OpponentID,
                CASE 
                    WHEN (HomeTeamID = @TeamID AND HomePoints > AwayPoints) OR 
                         (AwayTeamID = @TeamID AND AwayPoints > HomePoints) THEN 'Win'
                    ELSE 'Loss'
                END AS Result
            FROM SCHEDULE
            WHERE (HomeTeamID = @TeamID OR AwayTeamID = @TeamID) 
            AND (Season < @Year OR (Season = @Year AND Week < @Week))
        `;

        // Apply the period condition
        if (period === 'lastGame') {
            sql += ` ORDER BY Season DESC, Week DESC OFFSET 0 ROWS FETCH NEXT 1 ROWS ONLY`;
        } else if (period === 'last3Games') {
            sql += ` ORDER BY Season DESC, Week DESC OFFSET 0 ROWS FETCH NEXT 3 ROWS ONLY`;
        }

        const parameters = [
            { name: 'TeamID', type: TYPES.NVarChar, value: teamId },
            { name: 'Year', type: TYPES.Int, value: year },
            { name: 'Week', type: TYPES.Int, value: week }
        ];

        const opponentsResults = [];

        const sqlRequest = new Request(sql, (err) => {
            if (err) {
                console.error('Error executing SQL:', err);
                reject(err);
            }
        });

        parameters.forEach(param => sqlRequest.addParameter(param.name, param.type, param.value));

        sqlRequest.on('row', (columns) => {
            const opponentResult = {
                OpponentID: columns[0].value,
                Result: columns[1].value
            };
            opponentsResults.push(opponentResult);
        });

        sqlRequest.on('requestCompleted', async () => {
            let totalWins = 0, totalLosses = 0;

            for (const opponentResult of opponentsResults) {
                const opponentRecord = await getTeamRecord(opponentResult.OpponentID, year, week-1); // Adjust week if necessary

                if (opponentResult.Result === 'Win') {
                    totalWins += opponentRecord.Wins;
                } else {
                    totalLosses += opponentRecord.Losses;
                }
            }

            if (totalWins + totalLosses > 0) {
                const SOR = totalWins / (totalWins + totalLosses);
                resolve(SOR);
            } else {
                resolve(null); // Handle case with no applicable games
            }
        });

        connection.execSql(sqlRequest);
    });
};

async function getTeamRoster(teamID, year) {
    await connectPromise; // Ensure the database connection is established

    return new Promise((resolve, reject) => {
        const teamRoster = {
            Quarterbacks: [],
            RunningBacks: [],
            Receivers: [],
            Defenders: []
        };

        const sql = `
            SELECT 
                p.PlayerID, 
                p.Name, 
                p.Position,
                SUM(CASE WHEN p.Position = 'QB' THEN pgs.PassingYards ELSE 0 END) AS TotalPassingYards,
                SUM(CASE WHEN p.Position in ('RB', 'FB') THEN pgs.RushingYards ELSE 0 END) AS TotalRushingYards,
                SUM(CASE WHEN p.Position in ('WR', 'TE') THEN pgs.ReceivingYards ELSE 0 END) AS TotalReceivingYards,
                SUM(CASE WHEN p.Position IN ('CB', 'DB', 'DE', 'DL', 'DT', 'LB', 'SAF', 'OLB') THEN pgs.Combined ELSE 0 END) AS TotalTackles
            FROM PlayerGameStats pgs
            INNER JOIN Schedule s ON pgs.GameID = s.GameID
            INNER JOIN Players p ON pgs.PlayerID = p.PlayerID
            WHERE pgs.TeamID = @TeamID
              AND s.Season = @Year
            GROUP BY p.PlayerID, p.Name, p.Position
        `;

        const request = new Request(sql, (err) => {
            if (err) {
                console.error('Error executing SQL:', err);
                reject(err);
            }
        });

        // Adding parameters to prevent SQL injection
        request.addParameter('TeamID', TYPES.NVarChar, teamID);
        request.addParameter('Year', TYPES.Int, year);

        request.on('row', (columns) => {
            const player = columns.reduce((acc, column) => {
                acc[column.metadata.colName] = column.value;
                return acc;
            }, {});

            switch (player.Position) {
                case 'QB':
                    teamRoster.Quarterbacks.push(player);
                    break;
                case 'RB':
                case 'FB':
                    teamRoster.RunningBacks.push(player);
                    break;
                case 'WR':
                case 'TE':
                    teamRoster.Receivers.push(player);
                    break;
                default:
                    if (['CB', 'DB', 'DE', 'DL', 'DT', 'LB', 'SAF', 'OLB'].includes(player.Position)) {
                        teamRoster.Defenders.push(player);
                    }
                    break;
            }
        });

        request.on('requestCompleted', () => {
            // Sort and slice the arrays
            teamRoster.Quarterbacks.sort((a, b) => b.TotalPassingYards - a.TotalPassingYards);
            teamRoster.RunningBacks.sort((a, b) => b.TotalRushingYards - a.TotalRushingYards);
            teamRoster.Receivers.sort((a, b) => b.TotalReceivingYards - a.TotalReceivingYards);
            teamRoster.Defenders.sort((a, b) => b.TotalTackles - a.TotalTackles);

            // Apply slicing to limit the number of players
            teamRoster.Quarterbacks = teamRoster.Quarterbacks.slice(0, 1);
            teamRoster.RunningBacks = teamRoster.RunningBacks.slice(0, 4);
            teamRoster.Receivers = teamRoster.Receivers.slice(0, 7);
            teamRoster.Defenders = teamRoster.Defenders.slice(0, 12);

            resolve(teamRoster);
        });

        connection.execSql(request);
    });
}

async function getTeamStats(teamId, season, week, period) {
    await connectPromise; // Ensures the database connection is ready

    return new Promise((resolve, reject) => {
        // Construct the SQL query with parameters
        let sql = `
        DECLARE @MaxWeekForPeriod INT;
        IF @Period = 'lastGame'
        BEGIN
            -- Find the latest game week up to the specified week (excluding it)
            SELECT @MaxWeekForPeriod = MAX(Week)
            FROM Schedule
            WHERE Season = @Season
            AND Week < @Week
            AND (HomeTeamID = @TeamID OR AwayTeamID = @TeamID);
        END
        DECLARE @Last3Weeks TABLE (Week INT);
        IF @Period = 'last3Games'
        BEGIN
            INSERT INTO @Last3Weeks (Week)
            SELECT TOP 3 Week
            FROM Schedule
            WHERE Season = @Season
            AND Week < @Week
            AND (HomeTeamID = @TeamID OR AwayTeamID = @TeamID)
            ORDER BY Week DESC;
        END
        
        IF @Period = 'lastSeason'
        BEGIN
            SET @Season = @Season - 1; -- Adjust for last season
            SELECT @MaxWeekForPeriod = MAX(Week)
            FROM Schedule
            WHERE Season = @Season
            AND (HomeTeamID = @TeamID OR AwayTeamID = @TeamID);
        END
        ELSE
        BEGIN
            SET @MaxWeekForPeriod = NULL; -- For 'season', consider all games
        END;
        
        WITH TeamStats AS (
            SELECT 
                Season,
                Week,
                CASE WHEN HomeTeamID = @TeamID THEN 'Home' ELSE 'Away' END AS GameLocation,
                CASE WHEN HomeTeamID = @TeamID THEN HomePoints ELSE AwayPoints END AS PointsScored,
                CASE WHEN HomeTeamID = @TeamID THEN AwayPoints ELSE HomePoints END AS PointsAllowed,
                CASE WHEN HomeTeamID = @TeamID THEN HomeTotalYards ELSE AwayTotalYards END AS TotalYards,
                CASE WHEN HomeTeamID = @TeamID THEN HomeTurnovers ELSE AwayTurnovers END AS Turnovers,
                CASE WHEN HomeTeamID = @TeamID THEN HomePenalties ELSE AwayPenalties END AS Penalties,
                CASE WHEN HomeTeamID = @TeamID THEN HomeThirdDownSuccesses ELSE AwayThirdDownSuccesses END AS ThirdDownSuccesses,
                CASE WHEN HomeTeamID = @TeamID THEN HomeThirdDownAttempts ELSE AwayThirdDownAttempts END AS ThirdDownAttempts,
                CASE WHEN HomeTeamID = @TeamID THEN HomeRedZoneSuccesses ELSE AwayRedZoneSuccesses END AS RedZoneSuccesses,
                CASE WHEN HomeTeamID = @TeamID THEN HomeRedZoneAttempts ELSE AwayRedZoneAttempts END AS RedZoneAttempts,
                CASE WHEN HomeTeamID = @TeamID THEN HomeSacks ELSE AwaySacks END AS Sacks,
                CASE WHEN HomeTeamID = @TeamID THEN HomeInterceptions ELSE AwayInterceptions END AS Interceptions,
                CASE WHEN HomeTeamID = @TeamID THEN HomeForcedFumbles ELSE AwayForcedFumbles END AS ForcedFumbles,
                CASE WHEN HomeTeamID = @TeamID THEN HomePlayCount ELSE AwayPlayCount END AS Plays,
                CASE WHEN HomeTeamID = @TeamID THEN AwayPlayCount ELSE HomePlayCount END AS OpponentPlays,
                CASE WHEN HomeTeamID = @TeamID THEN AwayTotalYards ELSE HomeTotalYards END AS OpponentYards
            FROM Schedule
            WHERE Season = @Season
            AND (HomeTeamID = @TeamID OR AwayTeamID = @TeamID)
            AND (
                @Period != 'last3Games' OR
                Week IN (SELECT Week FROM @Last3Weeks)
            )
        ),
         AggregatedStats AS (
            SELECT
                COUNT(*) AS GamesPlayed,
                SUM(CASE WHEN PointsScored > PointsAllowed THEN 1 ELSE 0 END) AS Wins,
                SUM(PointsScored) AS TotalPointsScored,
                SUM(PointsAllowed) AS TotalPointsAllowed,
                SUM(TotalYards) AS TotalYards,
                SUM(Turnovers) AS TotalTurnovers,
                SUM(Penalties) AS TotalPenalties,
                SUM(ThirdDownSuccesses) AS TotalThirdDownSuccesses,
                SUM(ThirdDownAttempts) AS TotalThirdDownAttempts,
                SUM(RedZoneSuccesses) AS TotalRedZoneSuccesses,
                SUM(RedZoneAttempts) AS TotalRedZoneAttempts,
                SUM(Sacks) AS TotalSacks,
                SUM(Interceptions) AS TotalInterceptions,
                SUM(ForcedFumbles) AS TotalForcedFumbles,
                SUM(Plays) AS TotalPlays,
                SUM(OpponentYards) AS OpponentTotalYards,
                SUM(OpponentPlays) AS OpponentTotalPlays
            FROM TeamStats),
        
        OpponentDivisions AS (
            SELECT 
                s.Season,
                CASE WHEN s.HomeTeamID = @TeamID THEN s.AwayTeamID ELSE s.HomeTeamID END AS OpponentTeamID
            FROM Schedule s
            WHERE s.Season = @Season AND (s.HomeTeamID = @TeamID OR s.AwayTeamID = @TeamID)
        ),
        OpponentDivisionCounts AS (
            SELECT
                COUNT(*) AS TotalGames,
                SUM(CASE WHEN t.Division = 'FBS' THEN 1 ELSE 0 END) AS FBSGames,
                SUM(CASE WHEN t.Division = 'FCS' THEN 1 ELSE 0 END) AS FCSGames
            FROM OpponentDivisions od
            JOIN Teams t ON od.OpponentTeamID = t.TeamID
        ),
        FBSFCSRatio AS (
            SELECT
                CAST(FCSGames AS FLOAT) / NULLIF(FBSGames + FCSGames, 0) AS FCSFBSRatio
            FROM OpponentDivisionCounts
        ),
        
        DivisionTitle AS (
        SELECT DIVISION
        FROM TEAMS AS Division
        WHERE TeamID = @TeamID
        )
        
        SELECT
            GamesPlayed,
            Division,
            CAST(Wins AS FLOAT) / GamesPlayed AS WinPercentage,
            TotalPointsScored / CAST(GamesPlayed AS FLOAT) AS AveragePointsPerGame,
            TotalPointsAllowed / CAST(GamesPlayed AS FLOAT) AS AveragePointsAllowedPerGame,
            TotalYards / CAST(GamesPlayed AS FLOAT) AS AverageYardsPerGame,
            TotalTurnovers / CAST(GamesPlayed AS FLOAT) AS AverageTurnoversPerGame,
            TotalPenalties / CAST(GamesPlayed AS FLOAT) AS AveragePenaltiesPerGame,
            CAST(TotalThirdDownSuccesses AS FLOAT) / TotalThirdDownAttempts AS ThirdDownEfficiency,
            CAST(TotalRedZoneSuccesses AS FLOAT) / TotalRedZoneAttempts AS RedZoneEfficiency,
            TotalSacks / CAST(GamesPlayed AS FLOAT) AS AverageSacksPerGame,
            TotalInterceptions / CAST(GamesPlayed AS FLOAT) AS AverageInterceptionsPerGame,
            TotalForcedFumbles / CAST(GamesPlayed AS FLOAT) AS AverageForcedFumblesPerGame,
            CAST(TotalYards AS FLOAT) / CAST(TotalPlays AS FLOAT) AS YardsPerPlay,
            CAST(OpponentTotalYards AS FLOAT) / CAST(GamesPlayed AS FLOAT) AS OpponentYardsPerGame,
            CAST(OpponentTotalYards AS FLOAT) / CAST(OpponentTotalPlays AS FLOAT) AS OpponentYardsPerPlay,
            f.FCSFBSRatio
        
        FROM AggregatedStats, DivisionTitle CROSS JOIN FBSFCSRatio f;
    `

        const request = new Request(sql, (err) => {
            if (err) {
                return reject(err);
            }
        });

        // Parameters binding
        request.addParameter('TeamID', TYPES.NVarChar, teamId);
        request.addParameter('Season', TYPES.Int, season);
        request.addParameter('Week', TYPES.Int, week);
        request.addParameter('Period', TYPES.NVarChar, period);

        // Handling query result
        let result = null;
        request.on('row', (columns) => {
            result = {}; // Assuming single row result, adjust if expecting more
            columns.forEach((column) => {
                result[column.metadata.colName] = column.value;
            });
        });

        request.on('requestCompleted', () => {
            resolve(result); // Resolve with the processed result
        });

        request.on('error', (err) => {
            reject(err); // Handle errors
        });

        connection.execSql(request); // Execute the query
    });
}


module.exports = { getStatsForPlayer, getInfoForPlayer, getStatsForTeam, getFBSFCSForTeam, getFCSFBSOpponentRatio, getTeamWL, getTeamSOR, getTeamRecord, getTeamRoster, getTeamStats };