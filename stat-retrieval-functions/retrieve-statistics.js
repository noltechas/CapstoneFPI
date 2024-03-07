const { Connection, Request, TYPES } = require('tedious');
const { connection, connectPromise } = require('./databaseConnection'); // Adjust the path as necessary

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

async function getTeamRoster(teamID, year, period) {
    await connectPromise; // Ensure the database connection is established

    return new Promise((resolve, reject) => {
        let playerIDs = []; // Use an array to collect player IDs

        const sql = `
            DECLARE @GamesToConsider TABLE (GameID NVARCHAR(50));

-- Define @TotalGamesNeeded based on the period
            DECLARE @TotalGamesNeeded INT;
-- Set the total games needed based on the period
            SET @TotalGamesNeeded = CASE
                                        WHEN @Period = 'lastGame' THEN 1
                                        WHEN @Period LIKE 'last3Games%' THEN 3
                                        ELSE 2 -- Default for 'season', 'seasonHome', 'seasonAway', 'lastSeason', 'lastSeasonHome', 'lastSeasonAway'
                END;

-- Temporary table to store player participation counts
            DECLARE @PlayerParticipation TABLE (
                                                   PlayerID NVARCHAR(50),
                                                   GamesPlayed INT,
                                                   RequiredGames INT,
                                                   HasCompletedPeriod BIT
                                               );

-- Populate @PlayerParticipation with counts and determine if each player has met the required games
            INSERT INTO @PlayerParticipation (PlayerID, GamesPlayed, RequiredGames, HasCompletedPeriod)
            SELECT
                p.PlayerID,
                COUNT(DISTINCT pgs.GameID) AS GamesPlayed,
                @TotalGamesNeeded AS RequiredGames,
                CASE
                    WHEN COUNT(DISTINCT pgs.GameID) >= @TotalGamesNeeded THEN 1
                    ELSE 0
                    END AS HasCompletedPeriod
            FROM Players p
                     LEFT JOIN PlayerGameStats pgs ON p.PlayerID = pgs.PlayerID
            WHERE pgs.GameID IN (SELECT GameID FROM @GamesToConsider) AND pgs.TeamID = @TeamID
            GROUP BY p.PlayerID;

            DECLARE @FinalPlayers TABLE (
                                            PlayerID NVARCHAR(50),
                                            Name NVARCHAR(255),
                                            Position NVARCHAR(50),
                                            Stat INT,
                                            Rank INT
                                        );

            WITH PlayerStats AS (
                SELECT
                    p.PlayerID,
                    p.Name,
                    p.Position,
                    SUM(CASE WHEN p.Position = 'QB' THEN pgs.PassingYards ELSE 0 END) AS TotalPassingYards,
                    SUM(CASE WHEN p.Position IN ('RB', 'FB') THEN pgs.RushingYards ELSE 0 END) AS TotalRushingYards,
                    SUM(CASE WHEN p.Position IN ('WR', 'TE') THEN pgs.ReceivingYards ELSE 0 END) AS TotalReceivingYards,
                    SUM(CASE WHEN p.Position IN ('CB', 'DB', 'DE', 'DL', 'DT', 'LB', 'SAF', 'OLB') THEN pgs.Combined ELSE 0 END) AS TotalTackles,
                    MAX(p.RecruitingScore) AS RecruitingScore -- Using MAX to ensure a value is available for OL sorting
                FROM PlayerGameStats pgs
                         JOIN Schedule s ON pgs.GameID = s.GameID
                         JOIN Players p ON pgs.PlayerID = p.PlayerID
                WHERE pgs.TeamID = @TeamID AND s.Season = @Year
                GROUP BY p.PlayerID, p.Name, p.Position
            ), RankedPlayers AS (
                SELECT *,
                       ROW_NUMBER() OVER(PARTITION BY CASE
                                                          WHEN Position = 'QB' THEN 'QB'
                                                          WHEN Position IN ('RB', 'FB') THEN 'RB/FB'
                                                          WHEN Position IN ('WR', 'TE') THEN 'WR/TE'
                                                          WHEN Position IN ('CB', 'DB', 'DE', 'DL', 'DT', 'LB', 'SAF', 'OLB') THEN 'Defender'
                                                          WHEN Position IN ('OL') THEN 'OL'
                           END
                           ORDER BY
                               CASE WHEN Position = 'QB' THEN TotalPassingYards
                                    WHEN Position IN ('RB', 'FB') THEN TotalRushingYards
                                    WHEN Position IN ('WR', 'TE') THEN TotalReceivingYards
                                    WHEN Position IN ('CB', 'DB', 'DE', 'DL', 'DT', 'LB', 'SAF', 'OLB') THEN TotalTackles
                                    WHEN Position IN ('OL') THEN RecruitingScore
                                   END DESC) AS Rank
                FROM PlayerStats
            ),
                 RequiredGames AS (
                     SELECT
                         @TotalGamesNeeded AS GamesNeeded
                 ),
                 PlayerGames AS (
                     SELECT
                         pgs.PlayerID,
                         COUNT(DISTINCT pgs.GameID) AS GamesPlayed
                     FROM
                         PlayerGameStats pgs
                             JOIN @GamesToConsider gtc ON pgs.GameID = gtc.GameID
                     WHERE
                         pgs.TeamID = @TeamID
                     GROUP BY
                         pgs.PlayerID
                 ),
                 CompletionStatus AS (
                     SELECT
                         pg.PlayerID,
                         CASE
                             WHEN pg.GamesPlayed >= rg.GamesNeeded THEN 1
                             ELSE 0
                             END AS HasCompletedPeriod
                     FROM
                         PlayerGames pg,
                         RequiredGames rg
                 )
            INSERT INTO @FinalPlayers (PlayerID, Name, Position, Stat, Rank)
            SELECT PlayerID, Name, Position,
                   CASE
                       WHEN Position = 'QB' THEN TotalPassingYards
                       WHEN Position IN ('RB', 'FB') THEN TotalRushingYards
                       WHEN Position IN ('WR', 'TE') THEN TotalReceivingYards
                       WHEN Position IN ('CB', 'DB', 'DE', 'DL', 'DT', 'LB', 'SAF', 'OLB') THEN TotalTackles
                       WHEN Position = 'OL' THEN RecruitingScore
                       END AS Stat, Rank
            FROM RankedPlayers
            WHERE Rank <= CASE
                              WHEN Position = 'QB' THEN 1
                              WHEN Position IN ('RB', 'FB') THEN 4
                              WHEN Position IN ('WR', 'TE') THEN 7
                              WHEN Position IN ('CB', 'DB', 'DE', 'DL', 'DT', 'LB', 'SAF', 'OLB') THEN 12
                              WHEN Position = 'OL' THEN 5
                END;

-- Variables to hold counts
            DECLARE @QBCount INT = (SELECT COUNT(*) FROM @FinalPlayers WHERE Position = 'QB'),
                @RBFBCount INT = (SELECT COUNT(*) FROM @FinalPlayers WHERE Position IN ('RB', 'FB')),
                @WRTECount INT = (SELECT COUNT(*) FROM @FinalPlayers WHERE Position IN ('WR', 'TE')),
                @DefenderCount INT = (SELECT COUNT(*) FROM @FinalPlayers WHERE Position IN ('CB', 'DB', 'DE', 'DL', 'DT', 'LB', 'SAF', 'OLB')),
                @OLCount INT = (SELECT COUNT(*) FROM @FinalPlayers WHERE Position = 'OL');

-- Inserting placeholders if needed
            WHILE @QBCount < 1 OR @RBFBCount < 4 OR @WRTECount < 7 OR @DefenderCount < 12 OR @OLCount < 5
                BEGIN
                    IF @QBCount < 1 BEGIN
                        INSERT INTO @FinalPlayers VALUES ('', 'Placeholder', 'QB', 0, 999); SET @QBCount = @QBCount + 1;
                    END
                    IF @RBFBCount < 4 BEGIN
                        INSERT INTO @FinalPlayers VALUES ('', 'Placeholder', 'RB', 0, 999); SET @RBFBCount = @RBFBCount + 1;
                    END
                    IF @WRTECount < 7 BEGIN
                        INSERT INTO @FinalPlayers VALUES ('', 'Placeholder', 'WR', 0, 999); SET @WRTECount = @WRTECount + 1;
                    END
                    IF @DefenderCount < 12 BEGIN
                        INSERT INTO @FinalPlayers VALUES ('', 'Placeholder', 'Defender', 0, 999); SET @DefenderCount = @DefenderCount + 1;
                    END
                    IF @OLCount < 5 BEGIN
                        INSERT INTO @FinalPlayers VALUES ('', 'Placeholder', 'OL', 0, 999); SET @OLCount = @OLCount + 1;
                    END
                END;

-- Selecting the final list, ensuring exactly 29 players
            DECLARE @SelectedPlayers TABLE (
                                               PlayerID NVARCHAR(50),
                                               Name NVARCHAR(255),
                                               Position NVARCHAR(50),
                                               Stat INT,
                                               Rank INT
                                           );

            SELECT TOP 29 PlayerID FROM @FinalPlayers
            ORDER BY
                CASE
                    WHEN Position = 'QB' THEN 1
                    WHEN Position IN ('RB', 'FB') THEN 2
                    WHEN Position IN ('WR', 'TE') THEN 3
                    WHEN Position IN ('CB', 'DB', 'DE', 'DL', 'DT', 'LB', 'SAF', 'OLB') THEN 4
                    WHEN Position = 'OL' THEN 5
                    ELSE 6
                    END, Rank;
        `;

        const request = new Request(sql, (err) => {
            if (err) {
                console.error('Error executing SQL:', err);
                reject(err);
            }
        });

        // Adjust parameter bindings as necessary
        request.addParameter('TeamID', TYPES.NVarChar, teamID);
        request.addParameter('Year', TYPES.Int, year);
        request.addParameter('Period', TYPES.NVarChar, period);
        // Add more parameters if your logic requires them

        request.on('row', (columns) => {
            // Assuming each row contains a single column with the player ID
            playerIDs.push(columns[0].value); // Adjust index if necessary
        });

        request.on('requestCompleted', () => {
            resolve(playerIDs); // Resolve the promise with the array of player IDs
        });

        connection.execSql(request);
    });
}

async function getTeamStats(teamId, season, week, period) {
    await connectPromise; // Ensures the database connection is ready

    return new Promise((resolve, reject) => {
        // Construct the SQL query with parameters
        let sql = `
            DECLARE @RelevantGames TABLE (Week INT, Season INT);
            DECLARE @IsHome BIT = NULL;

            IF @Period IN ('last3GamesHome', 'lastSeasonHome', 'seasonHome') SET @IsHome = 1;
            ELSE IF @Period IN ('last3GamesAway', 'lastSeasonAway', 'seasonAway') SET @IsHome = 0;

-- Adjusted logic for identifying relevant games
            IF @Period IN ('lastGame', 'last3Games', 'last3GamesHome', 'last3GamesAway')
                BEGIN
                    ;WITH RankedGames AS (
                        SELECT
                            Week,
                            Season,
                            ROW_NUMBER() OVER (PARTITION BY Week ORDER BY Season DESC, Week DESC) AS RowNum
                        FROM Schedule
                        WHERE Season <= @Season
                          AND ((Season = @Season AND Week < @Week) OR Season < @Season)
                          AND ((@IsHome IS NULL) OR (@IsHome = 1 AND HomeTeamID = @TeamID) OR (@IsHome = 0 AND AwayTeamID = @TeamID))
                          AND (HomePoints != 0 OR AwayPoints != 0)
                    )
                     INSERT INTO @RelevantGames (Week, Season)
                     SELECT TOP 3 Week, Season
                     FROM RankedGames
                     WHERE RowNum = 1
                     ORDER BY Season DESC, Week DESC;
                END
            ELSE IF @Period IN ('season', 'lastSeason', 'seasonHome', 'seasonAway', 'lastSeasonHome', 'lastSeasonAway')
                BEGIN
                    DECLARE @TargetSeason INT = CASE
                                                    WHEN @Period LIKE 'lastSeason%' THEN @Season - 1
                                                    WHEN @Period IN ('seasonHome', 'seasonAway') THEN @Season
                                                    ELSE @Season
                        END;
                    INSERT INTO @RelevantGames (Week, Season)
                    SELECT Week, Season
                    FROM Schedule
                    WHERE Season = @TargetSeason
                      AND Week < CASE WHEN @Period IN ('season', 'seasonHome', 'seasonAway') THEN @Week ELSE 100 END
                      AND ((@Period IN ('season', 'lastSeason') AND (HomeTeamID = @TeamID OR AwayTeamID = @TeamID)) OR
                           (@Period IN ('lastSeasonHome', 'seasonHome') AND HomeTeamID = @TeamID AND @IsHome = 1) OR
                           (@Period IN ('lastSeasonAway', 'seasonAway') AND AwayTeamID = @TeamID AND @IsHome = 0))
                      AND (HomePoints != 0 OR AwayPoints != 0);
                END;
            WITH TeamStats AS (
                SELECT s.Season,
                       s.Week,
                       CASE WHEN HomeTeamID = @TeamID THEN 'Home' ELSE 'Away' END                                 AS GameLocation,
                       CASE WHEN HomeTeamID = @TeamID THEN HomePoints ELSE AwayPoints END                         AS PointsScored,
                       CASE WHEN HomeTeamID = @TeamID THEN AwayPoints ELSE HomePoints END                         AS PointsAllowed,
                       CASE WHEN HomeTeamID = @TeamID THEN HomeTotalYards ELSE AwayTotalYards END                 AS TotalYards,
                       CASE WHEN HomeTeamID = @TeamID THEN HomeTurnovers ELSE AwayTurnovers END                   AS Turnovers,
                       CASE WHEN HomeTeamID = @TeamID THEN HomePenalties ELSE AwayPenalties END                   AS Penalties,
                       CASE
                           WHEN HomeTeamID = @TeamID THEN HomeThirdDownSuccesses
                           ELSE AwayThirdDownSuccesses END                                                        AS ThirdDownSuccesses,
                       CASE
                           WHEN HomeTeamID = @TeamID THEN HomeThirdDownAttempts
                           ELSE AwayThirdDownAttempts END                                                         AS ThirdDownAttempts,
                       CASE
                           WHEN HomeTeamID = @TeamID THEN HomeRedZoneSuccesses
                           ELSE AwayRedZoneSuccesses END                                                          AS RedZoneSuccesses,
                       CASE
                           WHEN HomeTeamID = @TeamID THEN HomeRedZoneAttempts
                           ELSE AwayRedZoneAttempts END                                                           AS RedZoneAttempts,
                       CASE WHEN HomeTeamID = @TeamID THEN HomeSacks ELSE AwaySacks END                           AS Sacks,
                       CASE
                           WHEN HomeTeamID = @TeamID THEN HomeInterceptions
                           ELSE AwayInterceptions END                                                             AS Interceptions,
                       CASE
                           WHEN HomeTeamID = @TeamID THEN HomeForcedFumbles
                           ELSE AwayForcedFumbles END                                                             AS ForcedFumbles,
                       CASE WHEN HomeTeamID = @TeamID THEN HomePlayCount ELSE AwayPlayCount END                   AS Plays,
                       CASE WHEN HomeTeamID = @TeamID THEN AwayPlayCount ELSE HomePlayCount END                   AS OpponentPlays,
                       CASE WHEN HomeTeamID = @TeamID THEN AwayTotalYards ELSE HomeTotalYards END                 AS OpponentYards,
                       s.HomeTeamID,
                       s.AwayTeamID
                FROM Schedule s
                         INNER JOIN @RelevantGames rg ON s.Season = rg.Season AND s.Week = rg.Week
                WHERE (s.HomeTeamID = @TeamID OR s.AwayTeamID = @TeamID)
                  AND (s.HomePoints != 0 OR s.AwayPoints != 0)
            ),
                 AggregatedStats AS (
                     SELECT COUNT(*)                                                      AS GamesPlayed,
                            SUM(CASE WHEN PointsScored > PointsAllowed THEN 1 ELSE 0 END) AS Wins,
                            SUM(PointsScored)                                             AS TotalPointsScored,
                            SUM(PointsAllowed)                                            AS TotalPointsAllowed,
                            SUM(TotalYards)                                               AS TotalYards,
                            SUM(Turnovers)                                                AS TotalTurnovers,
                            SUM(Penalties)                                                AS TotalPenalties,
                            SUM(ThirdDownSuccesses)                                       AS TotalThirdDownSuccesses,
                            SUM(ThirdDownAttempts)                                        AS TotalThirdDownAttempts,
                            SUM(RedZoneSuccesses)                                         AS TotalRedZoneSuccesses,
                            SUM(RedZoneAttempts)                                          AS TotalRedZoneAttempts,
                            SUM(Sacks)                                                    AS TotalSacks,
                            SUM(Interceptions)                                            AS TotalInterceptions,
                            SUM(ForcedFumbles)                                            AS TotalForcedFumbles,
                            SUM(Plays)                                                    AS TotalPlays,
                            SUM(OpponentPlays)                                            AS OpponentTotalPlays,
                            SUM(OpponentYards)                                            AS OpponentTotalYards
                     FROM TeamStats
                 ),
                 DivisionTitle AS (
                     SELECT Division
                     FROM Teams
                     WHERE TeamID = @TeamID
                 ),
                 OpponentTeams AS (
                     SELECT CASE WHEN HomeTeamID = @TeamID THEN AwayTeamID ELSE HomeTeamID END AS OpponentTeamID,
                            Season,
                            Week
                     FROM TeamStats
                 ),
                 FBSFCSRatio AS (
                     SELECT CAST(SUM(CASE WHEN t.Division = 'FCS' THEN 1 ELSE 0 END) AS FLOAT) /
                            NULLIF(COUNT(*), 0) AS Ratio
                     FROM OpponentTeams ot
                              JOIN Teams t ON ot.OpponentTeamID = t.TeamID
                 )

            SELECT a.GamesPlayed,
                   d.Division,
                   CAST(a.Wins AS FLOAT) / NULLIF(a.GamesPlayed, 0)                               AS WinPercentage,
                   a.TotalPointsScored / CAST(a.GamesPlayed AS FLOAT)                             AS AveragePointsPerGame,
                   a.TotalPointsAllowed / CAST(a.GamesPlayed AS FLOAT)                            AS AveragePointsAllowedPerGame,
                   a.TotalYards / CAST(a.GamesPlayed AS FLOAT)                                    AS AverageYardsPerGame,
                   a.TotalTurnovers / CAST(a.GamesPlayed AS FLOAT)                                AS AverageTurnoversPerGame,
                   a.TotalPenalties / CAST(a.GamesPlayed AS FLOAT)                                AS AveragePenaltiesPerGame,
                   CAST(a.TotalThirdDownSuccesses AS FLOAT) /
                   NULLIF(a.TotalThirdDownAttempts, 0)                                            AS ThirdDownEfficiency,
                   CAST(a.TotalRedZoneSuccesses AS FLOAT) / NULLIF(a.TotalRedZoneAttempts, 0)     AS RedZoneEfficiency,
                   a.TotalSacks / CAST(a.GamesPlayed AS FLOAT)                                    AS AverageSacksPerGame,
                   a.TotalInterceptions / CAST(a.GamesPlayed AS FLOAT)                            AS AverageInterceptionsPerGame,
                   a.TotalForcedFumbles / CAST(a.GamesPlayed AS FLOAT)                            AS AverageForcedFumblesPerGame,
                   CAST(a.TotalYards AS FLOAT) / NULLIF(a.TotalPlays, 0)                          AS YardsPerPlay,
                   a.OpponentTotalYards / CAST(a.GamesPlayed AS FLOAT)                            AS OpponentYardsPerGame,
                   CAST(a.OpponentTotalYards AS FLOAT) /
                   NULLIF(a.OpponentTotalPlays, 0)                                                AS OpponentYardsPerPlay,
                   f.Ratio                                                                        AS FCSFBSRatio
            FROM AggregatedStats a
                     CROSS JOIN DivisionTitle d
                     CROSS JOIN FBSFCSRatio f;
    `

        const request = new Request(sql, (err) => {
            if (err) {
                console.error('Error executing SQL:', err);
                return reject(err);
            }
        });

        // Bind parameters to your SQL query to prevent SQL injection
        request.addParameter('TeamID', TYPES.NVarChar, teamId);
        request.addParameter('Season', TYPES.Int, season);
        request.addParameter('Week', TYPES.Int, week);
        request.addParameter('Period', TYPES.NVarChar, period);

        let resultData = {};

        request.on('row', (columns) => {
            columns.forEach((column) => {
                resultData[column.metadata.colName] = column.value;
            });
        });

        request.on('requestCompleted', () => {
            // Assuming the result is intended to be a single row/object
            resolve(resultData);
        });

        connection.execSql(request);
    });
}

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function getDefaultStats() {
    return {
        // Common stats for all players
        PlayerName: "Unknown",
        PlayerID: uuidv4(),
        RecruitingScore: 0,
        PeriodCompleted: 'False', // Assuming 'True' or 'False' as string values

        // Passing stats (primarily for QBs)
        PassingYardsPerGame: 0,
        PassingTouchdownsPerGame: 0,
        PassingAttemptsPerGame: 0,
        PassingCompletionsPerGame: 0,
        PassingInterceptionsPerGame: 0,

        // Rushing stats (for QBs, RBs)
        RushingYardsPerGame: 0,
        RushingYardsPerCarry: 0,
        RushingTouchdownsPerGame: 0,

        // Receiving stats (for WRs/TEs, RBs)
        ReceivingYardsPerGame: 0,
        ReceptionsPerGame: 0,
        ReceivingTouchdownsPerGame: 0,

        // Defensive stats (for Defenders)
        TacklesPerGame: 0,
        SacksPerGame: 0,
        InterceptionsPerGame: 0,
        ForcedFumblesPerGame: 0,
        PassesDefendedPerGame: 0,

        // General stats applicable to many positions
        FumblesPerGame: 0,

    };
}

async function getPlayerStats(playerIds, season, week, period) {
    await connectPromise; // Ensures the database connection is ready

    return new Promise((resolve, reject) => {
        let playerIdsArray;
        try {
            playerIdsArray = JSON.parse(playerIds);
        } catch (error) {
            console.error('Error parsing playerIds:', error);
            return reject('Invalid playerIds format');
        }

        // Track positions of blank player IDs and prepare valid player IDs for SQL
        let validPlayerIdsValues = [];
        let blankPlayerPositions = [];

        playerIdsArray.forEach((id, index) => {
            if (id.trim() === "") {
                blankPlayerPositions.push(index); // Remember position of the blank player ID
            } else {
                validPlayerIdsValues.push(`('${id}')`); // Only non-blank IDs for SQL
            }
        });

        // Continue if there are valid player IDs; otherwise, fill blanks immediately
        if (validPlayerIdsValues.length === 0) {
            let defaultStatsArray = playerIdsArray.map(id => id.trim() === "" ? getDefaultStats() : {});
            return resolve(defaultStatsArray);
        }

        let playerIdsValues = validPlayerIdsValues.join(",\n");

        let sql = `
            CREATE TABLE #PlayerIDs (InsertOrder INT IDENTITY(1,1), PlayerID NVARCHAR(50));
            INSERT INTO #PlayerIDs (PlayerID) VALUES ${playerIdsValues}

            CREATE TABLE #GamesToConsider (PlayerID NVARCHAR(50), GameID NVARCHAR(50));

-- Populate #GamesToConsider based on different periods
            IF @Period = 'season'
            BEGIN
                    -- Include all games from the current season before the current week for all players
            INSERT INTO #GamesToConsider (PlayerID, GameID)
            SELECT PlayerGameStats.PlayerID, Schedule.GameID
            FROM Schedule
                     JOIN PlayerGameStats ON Schedule.GameID = PlayerGameStats.GameID
            WHERE PlayerGameStats.PlayerID IN (SELECT PlayerID FROM #PlayerIDs)
              AND Schedule.Season = @Year
              AND Schedule.Week < @Week;
            END
-- Correction for 'lastGame' to ensure only one game per player is considered
            ELSE
                IF @Period = 'lastGame'
            BEGIN
                        ;
            WITH RankedGames AS (
                SELECT pgs.PlayerID,
                       sch.GameID,
                       ROW_NUMBER() OVER (PARTITION BY pgs.PlayerID ORDER BY sch.Season DESC, sch.Week DESC) AS rn
                FROM Schedule sch
                         JOIN PlayerGameStats pgs ON sch.GameID = pgs.GameID
                WHERE pgs.PlayerID IN (SELECT PlayerID FROM #PlayerIDs)
                  AND ((sch.Season = @Year AND sch.Week < @Week) OR (sch.Season < @Year))
            )
            INSERT
            INTO #GamesToConsider (PlayerID, GameID)
            SELECT PlayerID,
                   GameID
            FROM RankedGames
            WHERE rn = 1;
            END

            ELSE
                    IF @Period = 'lastSeason'
            BEGIN
                            -- Include all games from the previous season
            INSERT INTO #GamesToConsider (PlayerID, GameID)
            SELECT PlayerGameStats.PlayerID, Schedule.GameID
            FROM Schedule
                     JOIN PlayerGameStats ON Schedule.GameID = PlayerGameStats.GameID
            WHERE PlayerGameStats.PlayerID IN (SELECT PlayerID FROM #PlayerIDs)
              AND Schedule.Season = @Year - 1;
            END
-- Example adjustment for 'last3Games'
            ELSE
                        IF @Period = 'last3Games'
            BEGIN
                                ;
            WITH RankedGames AS (
                SELECT pgs.PlayerID,
                       sch.GameID,
                       ROW_NUMBER() OVER (PARTITION BY pgs.PlayerID ORDER BY sch.Season DESC, sch.Week DESC) AS rn
                FROM Schedule sch
                         JOIN PlayerGameStats pgs ON sch.GameID = pgs.GameID
                WHERE pgs.PlayerID IN (SELECT PlayerID FROM #PlayerIDs)
                  AND ((sch.Season = @Year AND sch.Week < @Week) OR (sch.Season < @Year))
            )
            INSERT
            INTO #GamesToConsider (PlayerID, GameID)
            SELECT PlayerID,
                   GameID
            FROM RankedGames
            WHERE rn <= 3;
            END
            ELSE
                            IF @Period = 'last3GamesHome'
            BEGIN
                                    ;
            WITH RankedGames AS (
                SELECT pgs.PlayerID,
                       sch.GameID,
                       sch.HomeTeamID,
                       pgs.TeamID,
                       ROW_NUMBER() OVER (PARTITION BY pgs.PlayerID ORDER BY sch.Season DESC, sch.Week DESC) AS rn
                FROM Schedule sch
                         JOIN PlayerGameStats pgs ON sch.GameID = pgs.GameID
                WHERE pgs.PlayerID IN (SELECT PlayerID FROM #PlayerIDs)
                  AND pgs.TeamID = sch.HomeTeamID
                  AND ((sch.Season = @Year AND sch.Week < @Week) OR (sch.Season < @Year))
            )
            INSERT
            INTO #GamesToConsider (PlayerID, GameID)
            SELECT PlayerID,
                   GameID
            FROM RankedGames
            WHERE rn <= 3;
            END
            ELSE
                                IF @Period = 'last3GamesAway'
            BEGIN
                                        ;
            WITH RankedGames AS (
                SELECT pgs.PlayerID,
                       sch.GameID,
                       sch.AwayTeamID,
                       pgs.TeamID,
                       ROW_NUMBER() OVER (PARTITION BY pgs.PlayerID ORDER BY sch.Season DESC, sch.Week DESC) AS rn
                FROM Schedule sch
                         JOIN PlayerGameStats pgs ON sch.GameID = pgs.GameID
                WHERE pgs.PlayerID IN (SELECT PlayerID FROM #PlayerIDs)
                  AND pgs.TeamID = sch.AwayTeamID
                  AND ((sch.Season = @Year AND sch.Week < @Week) OR (sch.Season < @Year))
            )
            INSERT
            INTO #GamesToConsider (PlayerID, GameID)
            SELECT PlayerID,
                   GameID
            FROM RankedGames
            WHERE rn <= 3;
            END
            ELSE
                                    IF @Period = 'seasonHome'
            BEGIN
                                            -- Include all home games from the current season before the current week
            INSERT INTO #GamesToConsider (PlayerID, GameID)
            SELECT PlayerGameStats.PlayerID, Schedule.GameID
            FROM Schedule
                     JOIN PlayerGameStats ON Schedule.GameID = PlayerGameStats.GameID
            WHERE PlayerGameStats.PlayerID IN (SELECT PlayerID FROM #PlayerIDs)
              AND Schedule.Season = @Year
              AND Schedule.Week < @Week
              AND PlayerGameStats.TeamID = Schedule.HomeTeamID;
            END
            ELSE
                                        IF @Period = 'lastSeasonHome'
            BEGIN
                                                -- Include all home games from the previous season
            INSERT INTO #GamesToConsider (PlayerID, GameID)
            SELECT PlayerGameStats.PlayerID, Schedule.GameID
            FROM Schedule
                     JOIN PlayerGameStats ON Schedule.GameID = PlayerGameStats.GameID
            WHERE PlayerGameStats.PlayerID IN (SELECT PlayerID FROM #PlayerIDs)
              AND Schedule.Season = @Year - 1
              AND PlayerGameStats.TeamID = Schedule.HomeTeamID;
            END
            ELSE
                                            IF @Period = 'lastSeasonAway'
            BEGIN
                                                    -- Include all away games from the previous season
            INSERT INTO #GamesToConsider (PlayerID, GameID)
            SELECT PlayerGameStats.PlayerID, Schedule.GameID
            FROM Schedule
                     JOIN PlayerGameStats ON Schedule.GameID = PlayerGameStats.GameID
            WHERE PlayerGameStats.PlayerID IN (SELECT PlayerID FROM #PlayerIDs)
              AND Schedule.Season = @Year - 1
              AND PlayerGameStats.TeamID = Schedule.AwayTeamID;
            END
            ELSE
                                                IF @Period = 'seasonAway'
            BEGIN
                                                        -- Include all away games from the current season before the current week
            INSERT INTO #GamesToConsider (PlayerID, GameID)
            SELECT PlayerGameStats.PlayerID, Schedule.GameID
            FROM Schedule
                     JOIN PlayerGameStats ON Schedule.GameID = PlayerGameStats.GameID
            WHERE PlayerGameStats.PlayerID IN (SELECT PlayerID FROM #PlayerIDs)
              AND Schedule.Season = @Year
              AND Schedule.Week < @Week
              AND PlayerGameStats.TeamID = Schedule.AwayTeamID;
            END

            SELECT pid.PlayerID,
                   p.Name AS PlayerName,
                   AVG(CAST(pgs.PassingYards AS FLOAT)) AS PassingYardsPerGame,
                   AVG(CAST(pgs.PassingTouchdowns AS FLOAT)) AS PassingTouchdownsPerGame,
                   AVG(CAST(pgs.PassingAttempts AS FLOAT)) AS PassingAttemptsPerGame,
                   AVG(CAST(pgs.PassingCompletions AS FLOAT)) AS PassingCompletionsPerGame,
                   AVG(CAST(pgs.PassingInterceptions AS FLOAT)) AS PassingInterceptionsPerGame,
                   AVG(CAST(pgs.RushingYards AS FLOAT)) AS RushingYardsPerGame,
                   CASE WHEN SUM(CAST(pgs.RushingAttempts AS FLOAT)) = 0 THEN NULL
                        ELSE AVG(CAST(pgs.RushingYards AS FLOAT)) / SUM(CAST(pgs.RushingAttempts AS FLOAT))
                       END AS RushingYardsPerCarry,
                   AVG(CAST(pgs.RushingTDs AS FLOAT)) AS RushingTouchdownsPerGame,
                   AVG(CAST(pgs.ReceivingYards AS FLOAT)) AS ReceivingYardsPerGame,
                   AVG(CAST(pgs.Receptions AS FLOAT)) AS ReceptionsPerGame,
                   AVG(CAST(pgs.ReceivingTDs AS FLOAT)) AS ReceivingTouchdownsPerGame,
                   AVG(CAST(pgs.Combined AS FLOAT)) AS TacklesPerGame,
                   AVG(CAST(pgs.Sacks AS FLOAT)) AS SacksPerGame,
                   AVG(CAST(pgs.Interceptions AS FLOAT)) AS InterceptionsPerGame,
                   AVG(CAST(pgs.ForcedFumbles AS FLOAT)) AS ForcedFumblesPerGame,
                   AVG(CAST(pgs.PassesDefended AS FLOAT)) AS PassesDefendedPerGame,
                   AVG(CAST(pgs.Fumbles AS FLOAT)) AS FumblesPerGame,
                   p.RecruitingScore,
                   CASE
                       WHEN @Period IN ('last3Games', 'last3GamesHome', 'last3GamesAway') AND COUNT(pgs.GameID) >= 3 THEN 'True'
                       WHEN @Period IN ('seasonHome', 'seasonAway', 'season') AND COUNT(pgs.GameID) >= 2 THEN 'True'
                       WHEN @Period IN ('lastGame') AND COUNT(pgs.GameID) >= 1 THEN 'True'
                       ELSE 'False'
                       END AS PeriodCompleted
            FROM #PlayerIDs pid
                     LEFT JOIN Players p ON pid.PlayerID = p.PlayerID
                     LEFT JOIN PlayerGameStats pgs ON p.PlayerID = pgs.PlayerID
                     LEFT JOIN #GamesToConsider gc ON pgs.GameID = gc.GameID AND pgs.PlayerID = gc.PlayerID
            GROUP BY pid.PlayerID, p.Name, p.RecruitingScore
            ORDER BY MIN(pid.InsertOrder);

-- Drop temporary tables at the end of your script to clean up
            DROP TABLE IF EXISTS #PlayerIDs;
            DROP TABLE IF EXISTS #GamesToConsider;
        `;

        const request = new Request(sql, (err) => {
            if (err) {
                console.error('Error executing SQL:', err);
                return reject(err);
            }
        });

        request.addParameter('playerIds', TYPES.NVarChar, JSON.stringify(playerIds));
        request.addParameter('Year', TYPES.Int, season);
        request.addParameter('Week', TYPES.Int, week);
        request.addParameter('Period', TYPES.NVarChar, period);

        let results = []; // Initialize an empty array to collect results

        request.on('row', (columns) => {
            let playerStats = {}; // Create an object for the current row's data
            columns.forEach(column => {
                playerStats[column.metadata.colName] = column.value;
            });
            results.push(playerStats); // Add the current row's data to the results array
        });

        request.on('requestCompleted', () => {
            // Placeholder for default stats in blank player ID positions
            let finalResults = new Array(playerIdsArray.length).fill(null);

            // Insert fetched stats into their original positions
            results.forEach((result, fetchedIndex) => {
                finalResults[playerIdsArray.indexOf(result.PlayerID)] = result;
            });

            // Fill in default stats for blank player IDs
            blankPlayerPositions.forEach(position => {
                finalResults[position] = getDefaultStats(); // Assign default stats
            });

            resolve(finalResults.filter(result => result)); // Filter out nulls if any remain
        });

        request.on('error', (err) => {
            console.error('Error executing SQL:', err);
            reject(err);
        });

        connection.execSql(request);
    });
}

async function getMatchupTeams(gameID) {
    await connectPromise;

    return new Promise((resolve, reject) => {
        const matchupInfo = {};

        const sql = `
            SELECT 
                HomeTeamID, 
                AwayTeamID, 
                Season, 
                Week
            FROM Schedule
            WHERE GameID = @GameID
        `;

        const request = new Request(sql, (err) => {
            if (err) {
                console.error('Error executing SQL:', err);
                reject(err);
            }
        });

        // Adding parameter to prevent SQL injection
        request.addParameter('GameID', TYPES.NVarChar, gameID);

        request.on('row', (columns) => {
            console.log('Row received', columns); // Add this line for debugging
            columns.forEach((column) => {
                matchupInfo[column.metadata.colName] = column.value;
            });
        });

        request.on('requestCompleted', () => {
            console.log('Request completed', matchupInfo); // Add this line for debugging
            if (Object.keys(matchupInfo).length === 0) {
                console.log('No data found for GameID:', gameID);
                reject('No data found'); // Reject if no data found
            } else {
                resolve(matchupInfo); // Resolve with the fetched matchup information
            }
        });

        request.on('error', (err) => {
            console.error('Error executing SQL:', err);
            reject(err);
        });

        connection.execSql(request);
    });
}

module.exports = { getStatsForPlayer, getInfoForPlayer, getStatsForTeam, getFBSFCSForTeam, getFCSFBSOpponentRatio, getTeamWL, getTeamSOR, getTeamRecord, getTeamRoster, getTeamStats, getPlayerStats, getMatchupTeams };