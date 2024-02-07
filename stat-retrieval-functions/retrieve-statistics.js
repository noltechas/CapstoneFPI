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

module.exports = { getStatsForPlayer, getInfoForPlayer };