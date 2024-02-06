const { Connection, Request, TYPES } = require('tedious');

// Configuration for your Azure SQL Database
const config = {
    server: 'college-football-server.database.windows.net',
    authentication: {
        type: 'default',
        options: {
            userName: 'chasnolte',
            password: 'qywzuk-2mykve-xatPij'
        }
    },
    options: {
        database: 'CollegeFootball',
        encrypt: true
    }
};

const connection = new Connection(config);

const getQbCompletionPercentageAndFlags = async (playerId, year, week, period) => {
    return new Promise((resolve, reject) => {
        if (!connection.connected) {
            reject(new Error("Database connection not established."));
            return;
        }

        // Fetch total games played by the player until the specified year and week
        const totalGamesSql = `
            SELECT COUNT(*) AS TotalGames, MIN(s.Season) AS FirstSeason
            FROM PlayerGameStats pgs
            INNER JOIN Schedule s ON pgs.GameID = s.GameID
            WHERE pgs.PlayerID = '${playerId}'
              AND (
                    s.Season < ${year} OR
                    (s.Season = ${year} AND s.Week <= ${week})
                  )
        `;

        connection.execSql(new Request(totalGamesSql, (err, rowCount, rows) => {
            if (err) {
                console.error('Error fetching total games:', err);
                reject(err);
                return;
            }

            const totalGames = rows[0][0].value;
            const firstSeason = rows[0][1].value;
            const isFirstGame = totalGames === 1;
            const isFirst3Games = totalGames <= 3;
            const isFirstSeason = firstSeason === year;

            // Now, calculate the completion percentage for the last game or the specified period
            let sql;
            switch (period) {
                case 'lastGame':
                    sql = `
                        SELECT TOP 1 pgs.PassingCompletions, pgs.PassingAttempts
                        FROM PlayerGameStats pgs
                                 INNER JOIN Schedule s ON pgs.GameID = s.GameID
                        WHERE pgs.PlayerID = '${playerId}'
                          AND (
                                    s.Season < ${year} OR
                                    (s.Season = ${year} AND s.Week < ${week})
                            )
                        ORDER BY s.Season DESC, s.Week DESC
                    `;
                    break;
                // Add other cases as necessary
                default:
                    reject(new Error('Invalid period specified'));
                    return;
            }

            const sqlRequest = new Request(sql, (err, rowCount) => {
                if (err) {
                    console.error('Error executing query:', err);
                    reject(err);
                    return;
                }
                if (rowCount === 0) {
                    console.log('No games found for the specified playerId and period.');
                    resolve({
                        completionPercentage: null,
                        isFirstGame,
                        isFirst3Games,
                        isFirstSeason
                    });
                    return;
                }
            });

            let completions;
            let attempts;

            sqlRequest.on('row', columns => {
                completions = columns[0].value;
                attempts = columns[1].value;
            });

            sqlRequest.on('requestCompleted', () => {
                if (completions !== undefined && attempts !== undefined) {
                    const completionPercentage = (completions / attempts) * 100;
                    resolve({
                        completionPercentage,
                        isFirstGame,
                        isFirst3Games,
                        isFirstSeason
                    });
                } else {
                    resolve({
                        completionPercentage: null,
                        isFirstGame,
                        isFirst3Games,
                        isFirstSeason
                    });
                }
            });

            connection.execSql(sqlRequest);
        }));
    });
};

module.exports = { getQbCompletionPercentageAndFlags };

connection.on('connect', err => {
    if (!err) {
        console.log("Connected to the database.");
    } else {
        console.error('Error connecting to the database:', err);
    }
});

connection.connect();