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
            password: 'qywzuk-2mykve-xatPij'
        }
    },
    options: {
        database: 'CollegeFootball',
        encrypt: true
    }
};

const connection = new Connection(config);

const fetchAndStoreTeams = () => {
    return new Promise((resolve, reject) => {
        const url = 'http://api.sportradar.us/ncaafb/trial/v7/en/league/hierarchy.xml?api_key=xhsc9b9vr5t2kqbgsmuekagj';
        request(url, { method: 'GET' }, (error, response, body) => {
            if (error) {
                console.error('Error fetching team data:', error);
                return reject(error);
            }

            parseString(body, (err, result) => {
                if (err) {
                    console.error('Error parsing XML:', err);
                    return reject(err);
                }

                const divisions = result.league.division;
                if (Array.isArray(divisions)) {
                    divisions.forEach(division => {
                        // Check if the division is Division I
                        console.log(division.$.name)
                        if (division.$.alias === "FBS" || division.$.name === "I-AA") {
                            if (Array.isArray(division.conference)) {
                                division.conference.forEach(conference => {
                                    if (Array.isArray(conference.team)) {
                                        conference.team.forEach(team => {
                                            insertTeamData(team);
                                        });
                                    }
                                });
                            }
                        }
                    });
                }

                resolve();
            });
        });
    });
};

const teamOperationsQueue = [];

const insertTeamData = (team) => {
    teamOperationsQueue.push(() => new Promise((resolve, reject) => {
        const teamID = team.$.id;
        const name = team.$.name;
        const market = team.$.market;
        const alias = team.$.alias;

        const sql = `
            MERGE INTO Teams AS Target
            USING (SELECT @TeamID AS TeamID) AS Source
            ON Target.TeamID = Source.TeamID
            WHEN MATCHED THEN
                UPDATE SET 
                    Name = @Name, 
                    Market = @Market, 
                    Alias = @Alias
            WHEN NOT MATCHED THEN
                INSERT (TeamID, Name, Market, Alias)
                VALUES (@TeamID, @Name, @Market, @Alias);
        `;

        const mergeRequest = new Request(sql, (err) => {
            if (err) {
                console.error(`Error updating team data for ${name}:`, err);
                return reject(err);
            }
            console.log(`Updated/Inserted team: ${name}`);
            resolve();
        });

        mergeRequest.addParameter('TeamID', TYPES.NVarChar, teamID);
        mergeRequest.addParameter('Name', TYPES.NVarChar, name);
        mergeRequest.addParameter('Market', TYPES.NVarChar, market);
        mergeRequest.addParameter('Alias', TYPES.NVarChar, alias);

        connection.execSql(mergeRequest);
    }));
};

const processTeamOperations = async () => {
    for (const operation of teamOperationsQueue) {
        await operation();
    }
};

connection.on('connect', err => {
    if (err) {
        console.error('Error connecting to database:', err);
    } else {
        fetchAndStoreTeams().then(() => {
            return processTeamOperations();
        }).then(() => {
            console.log('Team data fetching and storage complete.');
            connection.close();
        }).catch(err => {
            console.error('Error during team data processing:', err);
            connection.close();
        });
    }
});

connection.connect();
