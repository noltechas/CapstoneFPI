const { Connection, Request, TYPES } = require('tedious');
const { connection, connectPromise } = require('./databaseConnection'); // Adjust the path as necessary

const getTeamSoR = async (teamId, year, week, period) => {
    await connectPromise;

    return new Promise((resolve, reject) => {
        // Determine the SQL query based on the period
        let sql = buildSoRQuery(teamId, year, week, period);

        if (!sql) {
            return reject(new Error('Invalid period specified or query construction failed'));
        }

        const request = new Request(sql, (err, rowCount, rows) => {
            if (err) {
                console.error('Error executing SQL:', err);
                return reject(err);
            }

            if (rowCount === 0) {
                return resolve({ SoR: null, message: 'No relevant games found for the specified team and period.' });
            }

            // Assuming the query calculates SoR directly or provides enough data to calculate it here
            const SoR = calculateSoRFromRows(rows);
            resolve({ SoR });
        });

        connection.execSql(request);
    });
};

function buildSoRQuery(teamId, year, week, period) {
    let sql;
    switch (period) {
        case 'lastGame':
            sql = `
                SELECT s.OpponentTeamID, s.Result 
                FROM Schedule s
                WHERE s.TeamID = '${teamId}' AND s.Year = ${year} AND s.Week < ${week}
                ORDER BY s.Year DESC, s.Week DESC
                LIMIT 1
            `;
            break;
        case 'last3Games':
            sql = `
                SELECT s.OpponentTeamID, s.Result 
                FROM Schedule s
                WHERE s.TeamID = '${teamId}' AND ((s.Year = ${year} AND s.Week < ${week}) OR s.Year < ${year})
                ORDER BY s.Year DESC, s.Week DESC
                LIMIT 3
            `;
            break;
        case 'currentSeason':
            sql = `
                SELECT s.OpponentTeamID, s.Result 
                FROM Schedule s
                WHERE s.TeamID = '${teamId}' AND s.Year = ${year}
            `;
            break;
        case 'lastSeason':
            sql = `
                SELECT s.OpponentTeamID, s.Result 
                FROM Schedule s
                WHERE s.TeamID = '${teamId}' AND s.Year = ${year - 1}
            `;
            break;
        default:
            throw new Error('Invalid period specified');
    }
    return sql;
}

function calculateSoRFromRows(rows) {
    let wins = 0;
    let totalGames = rows.length;

    rows.forEach(row => {
        if (row.Result === 'Win') { // Assuming 'Result' column is 'Win' or 'Loss'
            wins++;
        }
    });

    // If there are no games, avoid division by zero
    if (totalGames === 0) return null;

     // SoR as a percentage
    return (wins / totalGames) * 100;
}

module.exports = getTeamSoR;

// Example usage:
// getTeamSoR('teamId', 2023, 5, 'lastGame').then(console.log).catch(console.error);