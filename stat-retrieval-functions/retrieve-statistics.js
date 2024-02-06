const { Connection, Request, TYPES } = require('tedious');
const { connection, connectPromise } = require('./databaseConnection'); // Adjust the path as necessary

const getStatsForPlayer = async (playerId, year, week, period, statNames) => {
    await connectPromise;
    return new Promise((resolve, reject) => {
        let sql;
        switch (period) {
            case 'lastGame':
                // SQL Server syntax for top 1
                sql = `SELECT TOP 1 ${statNames.join(', ')} FROM PlayerGameStats pgs INNER JOIN Schedule s ON pgs.GameID = s.GameID WHERE pgs.PlayerID = '${playerId}' AND (s.Season < ${year} OR (s.Season = ${year} AND s.Week < ${week})) ORDER BY s.Season DESC, s.Week DESC`;
                break;
            case 'last3Games':
                // Adjust for last 3 games; this logic needs to be updated based on your database's SQL dialect for aggregation
                sql = `SELECT ${statNames.map(stat => `SUM(${stat}) AS ${stat}`).join(', ')} FROM (SELECT ${statNames.join(', ')} FROM PlayerGameStats pgs INNER JOIN Schedule s ON pgs.GameID = s.GameID WHERE pgs.PlayerID = '${playerId}' AND (s.Season < ${year} OR (s.Season = ${year} AND s.Week < ${week})) ORDER BY s.Season DESC, s.Week DESC OFFSET 0 ROWS FETCH NEXT 3 ROWS ONLY) AS Last3Games`;
                break;
            default:
                return reject(new Error('Invalid period specified'));
        }

        const stats = {};
        const sqlRequest = new Request(sql, (err) => {
            if (err) {
                console.error('Error executing SQL:', err);
                return reject(err);
            }
        });

        sqlRequest.on('row', (columns) => {
            columns.forEach((column) => {
                // Assuming column metadata allows for direct mapping to statNames
                if (column.metadata && statNames.includes(column.metadata.colName)) {
                    stats[column.metadata.colName] = column.value;
                }
            });
        });

        sqlRequest.on('requestCompleted', () => {
            // Once all rows have been processed
            if (Object.keys(stats).length > 0) {
                resolve(stats);
            } else {
                resolve(null); // or reject(new Error('No data found.')); based on your error handling
            }
        });

        connection.execSql(sqlRequest);
    });
};

module.exports = getStatsForPlayer;