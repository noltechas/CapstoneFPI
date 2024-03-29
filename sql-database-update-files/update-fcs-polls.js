const { Connection, Request, TYPES } = require('tedious');
const axios = require('axios');

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
        const sql = `SELECT COUNT(*) AS count FROM Teams WHERE TeamID = @TeamID`;
        const request = new Request(sql, (err, rowCount) => {
            if (err) {
                console.error(err);
                return reject(err);
            }
            resolve(rowCount > 0);
        });

        request.addParameter('TeamID', TYPES.NVarChar, teamID);
        connection.execSql(request);
    });
};

const upsertPollData = async (season, week, team, isCandidate) => {
    const teamExists = await checkTeamExists(team.id);
    if (!teamExists) {
        console.log(`Team ${team.market} ${team.name} (${team.id}) does not exist in the Teams table. Skipping insert/update.`);
        return;
    }

    return new Promise((resolve, reject) => {
        const sql = `MERGE INTO FCS_POLLS AS Target
                     USING (SELECT @Season AS Season, @Week AS Week, @TeamID AS TeamID) AS Source
                     ON Target.Season = Source.Season AND Target.Week = Source.Week AND Target.TeamID = Source.TeamID
                     WHEN MATCHED THEN
                         UPDATE SET Points = @Points
                     WHEN NOT MATCHED THEN
                         INSERT (Season, Week, TeamID, Points)
                         VALUES (@Season, @Week, @TeamID, @Points);`;

        const request = new Request(sql, (err) => {
            if (err) {
                console.error(err);
                return reject(err);
            }
            resolve();
        });

        request.addParameter('Season', TYPES.Int, season);
        request.addParameter('Week', TYPES.Int, week);
        request.addParameter('TeamID', TYPES.NVarChar, team.id);
        request.addParameter('Points', TYPES.Int, isCandidate ? team.votes : team.points);

        connection.execSql(request);
    });
};

// Function to fetch and store poll data
const fetchAndStorePollData = async (season, week) => {
    const url = `https://api.sportradar.com/ncaafb/trial/v7/en/polls/FCS25/${season}/${week < 10 ? '0' + week : week}/rankings.json?api_key=gHdTvYjrKo23z4PaRj15Z8JoMoUSk5N854w9EKP9`;

    try {
        const response = await axios.get(url);
        const rankings = response.data.rankings;
        const candidates = response.data.candidates;

        for (const team of rankings) {
            await upsertPollData(season, week, team, false);
        }

        for (const team of candidates) {
            await upsertPollData(season, week, team, true);
        }
    } catch (error) {
        console.error(`Error fetching poll data for season ${season}, week ${week}:`, error.message);
    }
};

connection.on('connect', async (err) => {
    if (!err) {
        for (let season = 2014; season <= 2023; season++) {
            for (let week = 0; week <= 20; week++) {
                await fetchAndStorePollData(season, week);
                console.log(`Processed Season: ${season}, Week: ${week}`);
            }
        }
        connection.close();
    } else {
        console.error(err);
    }
});

connection.connect();