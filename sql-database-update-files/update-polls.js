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

const upsertPollData = async (season, week, team, isCandidate, pollType) => {
    return new Promise((resolve, reject) => {
        const sql = `MERGE INTO POLLS AS Target
                     USING (SELECT @Season AS Season, @Week AS Week, @TeamID AS TeamID, @Type AS Type) AS Source
                     ON Target.Season = Source.Season AND Target.Week = Source.Week AND Target.TeamID = Source.TeamID AND Target.Type = Source.Type
                     WHEN MATCHED THEN
                         UPDATE SET Points = @Points
                     WHEN NOT MATCHED THEN
                         INSERT (Season, Week, TeamID, Points, Type)
                         VALUES (@Season, @Week, @TeamID, @Points, @Type);`;

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
        request.addParameter('Type', TYPES.VarChar, pollType);

        connection.execSql(request);
    });
};

// Function to fetch and store poll data
const fetchAndStorePollData = async (season, week) => {
    const urls = [
        `https://api.sportradar.com/ncaafb/trial/v7/en/polls/AP25/${season}/${week < 10 ? '0' + week : week}/rankings.json?api_key=gHdTvYjrKo23z4PaRj15Z8JoMoUSk5N854w9EKP9`,
        `https://api.sportradar.com/ncaafb/trial/v7/en/polls/FCS25/${season}/${week < 10 ? '0' + week : week}/rankings.json?api_key=gHdTvYjrKo23z4PaRj15Z8JoMoUSk5N854w9EKP9`
    ];

    for (const url of urls) {
        try {
            const response = await axios.get(url);
            const rankings = response.data.rankings;
            const candidates = response.data.candidates;
            const pollType = url.includes('AP25') ? 'AP' : 'FCS';

            for (const team of rankings) {
                await upsertPollData(season, week, team, false, pollType);
            }

            for (const team of candidates) {
                await upsertPollData(season, week, team, true, pollType);
            }
        } catch (error) {
            console.error(`Error fetching poll data for season ${season}, week ${week}:`, error.message);
        }
    }
};

connection.on('connect', async (err) => {
    if (!err) {
        for (let season = 2020; season <= 2020; season++) {
            for (let week = 21; week <= 40; week++) {
                await fetchAndStorePollData(season, week);
                console.log(`Added/Updated Season: ${season}, Week: ${week}`);
            }
        }
        connection.close();
    } else {
        console.error(err);
    }
});

connection.connect();