const { Connection, Request, TYPES } = require('tedious');
const request = require('request');
const parseString = require('xml2js').parseString;

// Azure SQL Database configuration
const config = {
    server: 'college-football-server.database.windows.net',
    authentication: {
        type: 'default',
        options: {
            userName: 'chasnolte',
            password: 'qywzuk-2mykve-xatPij',
        }
    },
    options: {
        database: 'CollegeFootball',
        encrypt: true,
    }
};

// Create connection to Azure SQL Database
const connection = new Connection(config);

const checkTeamExists = async (teamID) => {
    return new Promise((resolve, reject) => {
        const sql = `SELECT COUNT(1) AS TeamCount FROM Teams WHERE TeamID = @TeamID`;
        const checkRequest = new Request(sql, (err) => {
            if (err) {
                console.error(`Error checking team ${teamID}:`, err);
                return reject(err);
            }
        });

        let teamExists = false;
        checkRequest.addParameter('TeamID', TYPES.NVarChar, teamID);

        checkRequest.on('row', (columns) => {
            // Check if the count is greater than 0
            if (columns[0].value > 0) {
                teamExists = true;
            }
        });

        checkRequest.on('requestCompleted', () => {
            resolve(teamExists); // Resolve with true/false based on team existence
        });

        connection.execSql(checkRequest);
    });
};

const upsertData = async (game, year, week) => {
    return new Promise(async (resolve, reject) => {
        const sql = `MERGE INTO SCHEDULE AS Target
                     USING (SELECT @GameID AS GameID) AS Source
                     ON Target.GameID = Source.GameID
                     WHEN MATCHED THEN
                         UPDATE SET HomeTeamID = @HomeTeamID, AwayTeamID = @AwayTeamID, HomePoints = @HomePoints, AwayPoints = @AwayPoints, Season = @Season, Week = @Week
                     WHEN NOT MATCHED THEN
                         INSERT (GameID, HomeTeamID, AwayTeamID, HomePoints, AwayPoints, Season, Week)
                         VALUES (@GameID, @HomeTeamID, @AwayTeamID, @HomePoints, @AwayPoints, @Season, @Week);`;

        const request = new Request(sql, (err) => {
            if (err) {
                console.error(err);
                return reject(err);
            }
            resolve();
        });

        const homeTeam = game.home[0].$.name;
        const awayTeam = game.away[0].$.name;
        let homePoints, awayPoints;

        if (game.scoring && game.scoring[0] && game.scoring[0].$) {
            homePoints = game.scoring[0].$.home_points;
            awayPoints = game.scoring[0].$.away_points;
        } else {
            // Default points to 0 if scoring data is not available
            homePoints = 0;
            awayPoints = 0;
        }
        const gameID = game.$.id;
        const homeTeamID = game.home[0].$.id;
        const awayTeamID = game.away[0].$.id;

        // Check if both teams exist in the Teams table
        const homeTeamExists = await checkTeamExists(homeTeamID);
        const awayTeamExists = await checkTeamExists(awayTeamID);

        if (!homeTeamExists || !awayTeamExists) {
            console.log(`Skipping game: HomeTeamID: ${homeTeam}, AwayTeamID: ${awayTeam} as one or both teams do not exist.`);
            resolve();
            return;
        }

        request.addParameter('GameID', TYPES.NVarChar, game.$.id);
        request.addParameter('HomeTeamID', TYPES.NVarChar, homeTeamID);
        request.addParameter('AwayTeamID', TYPES.NVarChar, awayTeamID);
        request.addParameter('HomePoints', TYPES.Int, homePoints);
        request.addParameter('AwayPoints', TYPES.Int, awayPoints);
        request.addParameter('Season', TYPES.Int, year);
        request.addParameter('Week', TYPES.Int, week);

        console.log(`Added/Updated ${homeTeam} at ${awayTeam} ${year} week ${week}`);

        connection.execSql(request);
    });
};

// Function to fetch and parse data
const fetchAndStoreData = (year) => {
    const url = `http://api.sportradar.us/ncaafb/trial/v7/en/games/${year}/REG/schedule.xml?api_key=xhsc9b9vr5t2kqbgsmuekagj`;

    request(url, async (error, response, body) => {
        if (!error && response.statusCode == 200) {
            parseString(body, async (err, result) => {
                if (err) {
                    console.error(err);
                    return;
                }
                const weeks = result.season.week;
                for (const week of weeks) {
                    const games = week.game;
                    const weekNumber = week.$.sequence;
                    for (const game of games) {
                        await upsertData(game, year, weekNumber);
                    }
                }
            });
        } else {
            console.error(error);
        }
    });
};

connection.on('connect', err => {
    if (!err) {
        fetchAndStoreData(2023);
    } else {
        console.error(err);
    }
});

connection.connect();