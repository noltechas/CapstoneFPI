const { Connection, Request, TYPES } = require('tedious');
const request = require('request');
const parseString = require('xml2js').parseString;
const axios = require('axios');

const parseXml = (xml) => {
    return new Promise((resolve, reject) => {
        parseString(xml, (err, result) => {
            if (err) reject(err);
            else resolve(result);
        });
    });
};

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

const connectionStateManager = {
    isReady: true,
    waitForReady: async () => {
        if (connectionStateManager.isReady) return;
        await new Promise(resolve => {
            const checkConnection = setInterval(() => {
                if (connectionStateManager.isReady) {
                    clearInterval(checkConnection);
                    resolve();
                }
            }, 250); // Check every second
        });
    }
};

// Add a global variable to track connection state
let connectionReady = true;

connection.on('end', () => {
    connectionStateManager.isReady = false;
});

connection.on('error', () => {
    connectionStateManager.isReady = false;
});

const fetchGameIDs = async () => {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT GameID FROM Schedule WHERE SEASON = 2020';
        const gameIDs = [];
        const sqlRequest = new Request(sql, (err) => {
            if (err) {
                console.error('Error fetching game IDs:', err);
                return reject(err);
            }
        });

        sqlRequest.on('row', (columns) => {
            gameIDs.push(columns[0].value);
        });

        sqlRequest.on('requestCompleted', () => {
            resolve(gameIDs);
        });

        connection.execSql(sqlRequest);
    });
};

const insertPlayerGameStats = async (playerStats, gameID) => {

    const tableName = "PlayerGameStats";
    let columns = Object.keys(playerStats).concat("GameID").filter((value, index, self) => self.indexOf(value) === index); // Ensure no duplicates
    let placeholders = columns.map(key => `@${key}`);
    let sqlInsert = `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`;

    // Corrected conditional logic: we avoid the CASE statement to simplify the logic and directly attempt an update or insert
    let sqlUpdate = `UPDATE ${tableName} SET ${columns.filter(key => key !== 'PlayerID' && key !== 'GameID').map(key => `${key} = ISNULL(@${key}, ${key})`).join(", ")} WHERE PlayerID = @PlayerID AND GameID = @GameID`;

    const execSqlCommand = async (sqlCommand, parameters) => {
        await connectionStateManager.waitForReady(); // Ensure connection is ready before proceeding

        return new Promise((resolve, reject) => {
            const request = new Request(sqlCommand, (err) => {
                if (err) {
                    //console.error(`Error executing SQL: ${err}`);
                    reject(err);
                } else {
                    resolve();
                }
            });

            parameters.forEach(param => {
                let type = TYPES.NVarChar; // Default type
                // Determine parameter type based on the value
                if (typeof param.value === 'number') {
                    type = Number.isInteger(param.value) ? TYPES.Int : TYPES.Float;
                }
                request.addParameter(param.name, type, param.value);
            });

            connection.execSql(request);
        });
    };

    let parameters = columns.map(key => ({ name: key, value: playerStats.hasOwnProperty(key) ? playerStats[key] : gameID }));

    try {
        await execSqlCommand(sqlInsert, parameters);
        //console.log(`Insert operation successful for PlayerID: ${playerStats.PlayerID}`);
    } catch (error) {
        if (error.number === 2627) { // Check for SQL Server's error code for primary key violation
            await execSqlCommand(sqlUpdate, parameters);
        } else {
            console.error(`Unhandled error for PlayerID: ${playerStats.PlayerID}, GameID: ${gameID}`, error);
        }
    }
};

const insertTeamGameStats = async (teamStats, gameID, isHomeTeam) => {
    const tableName = "SCHEDULE";
    let columns = Object.keys(teamStats);
    // Map the keys of teamStats to your actual column names
    let sqlUpdateColumns = columns.map(key => {
        const prefix = isHomeTeam ? 'Home' : 'Away'; // Determine the prefix based on isHomeTeam
        // Assuming your actual column names are prefixed correctly in your schema
        // For example, if teamStats contains a key 'TotalYards', it maps to 'HomeTotalYards' or 'AwayTotalYards'
        return `${prefix}${key} = @${key}`;
    });

    let sqlUpdate = `UPDATE ${tableName} SET ${sqlUpdateColumns.join(", ")} WHERE GameID = @GameID`;


    const execSqlCommand = async (sqlCommand, parameters) => {
        await connectionStateManager.waitForReady(); // Ensure the connection is ready before proceeding

        return new Promise((resolve, reject) => {
            const request = new Request(sqlCommand, (err) => {
                if (err) {
                    console.error(`Error executing SQL: ${err}`);
                    reject(err);
                } else {
                    resolve();
                }
            });

            parameters.forEach(param => {
                // Determine the parameter type based on the expected input
                let type;
                let value = param.value;

                if (param.name !== 'GameID') {

                    if (typeof value === 'number') {
                        // Correctly handle NaN values for numerical parameters
                        if (isNaN(value)) {
                            value = 0; // Default NaN to 0 for numerical fields
                        }
                        type = Number.isInteger(value) ? TYPES.Int : TYPES.Float;
                    } else if (typeof value === 'string') {
                        // For strings, check if it's intended for a numeric column but couldn't be parsed
                        let parsedValue = parseFloat(value);
                        if (!isNaN(parsedValue)) {
                            // If the string can be parsed to a number, decide type based on parsed value
                            value = parsedValue;
                            type = Number.isInteger(parsedValue) ? TYPES.Int : TYPES.Float;
                        } else {
                            // If parsing fails or isn't intended, handle as nvarchar
                            type = TYPES.NVarChar;
                        }
                    } else {
                        // Fallback for any other types, handling them as strings/nvarchar
                        value = String(value); // Convert to string to ensure compatibility
                        type = TYPES.NVarChar;
                    }

                    // Add parameter with the determined type and value
                    request.addParameter(param.name, type, value);
                }
            });

            // Don't forget to add the GameID parameter for the WHERE clause
            request.addParameter('GameID', TYPES.NVarChar, gameID);

            connection.execSql(request);
        });
    };

    // Prepare parameters, including mapping for 'GameID'
    let parameters = columns.map(key => ({ name: key, value: teamStats[key] }));
    parameters.push({ name: 'GameID', value: gameID }); // Ensure GameID is added correctly

    try {
        await execSqlCommand(sqlUpdate, parameters);
        console.log(`Update operation successful for GameID: ${gameID}`);
    } catch (error) {
        console.error(`Error updating team stats for GameID: ${gameID}`, error);
    }
};

const processGameStats = async (gameID) => {
    console.log(`Processing game with ID: ${gameID}`);
    try {
        const response = await axios.get(`http://api.sportradar.us/ncaafb/trial/v7/en/games/${gameID}/statistics.xml?api_key=fcjjxa2ffuxasak7c82gf4f7`);
        // Next key: fcjjxa2ffuxasak7c82gf4f7
        // Next key: qyzxb5wcu4k79vqjet8zkesy
        // More left: am4kj5e64x99kzxjurstysqc
        const xml = response.data;

        const result = await parseXml(xml);

        if (result && result.game && result.game.team) {
            for (const team of result.game.team) {
                const teamStats = buildTeamStats(team, gameID);
                try {
                    await insertTeamGameStats(teamStats, gameID, team.$.id === result.game.summary[0].home[0].$.id);
                } catch (error) {
                    console.error(`Failed to insert/update team stats for GameID: ${gameID}`, error);
                }
            }

            for (const team of result.game.team) {
                const teamID = team.$.id;
                for (const category of ['rushing', 'receiving', 'passing', 'penalties', 'kick_returns', 'punt_returns', 'int_returns', 'fumbles', 'defense', 'misc_returns', 'conversions']) {

                    if (team[category] && team[category][0] && team[category][0].player) {
                        for (const player of team[category][0].player) {
                            const playerStats = buildPlayerStats(player, teamID, gameID, category);
                            try {
                                await insertPlayerGameStats(playerStats, gameID); // Ensure await is used
                            } catch (error) {
                                console.error(`Failed to insert/update player stats for PlayerID: ${playerStats.PlayerID}, GameID: ${gameID}`, error);
                            }
                        }
                    }
                }
            }

        }
        //console.log(`Successfully processed game with ID: ${gameID}`);
    } catch (error) {
        console.error(`Error fetching game stats for game ID ${gameID}:`, error);
    }
};

const buildPlayerStats = (player, teamID, gameID, category) => {
    //console.log(`Building ${category} stats for ${player.$.name}`)
    let playerStats = {
        PlayerID: player.$.id,
        GameID: gameID,
        TeamID: teamID,
        Position: player.$.position || '',
        GamesPlayed: 0,
        GamesStarted: 0,
    };

    // Check category and extend playerStats accordingly
    switch (category) {
        case 'rushing':
            Object.assign(playerStats, {
                RushingAttempts: parseInt(player.$.attempts) || 0,
                RushingYards: parseInt(player.$.yards) || 0,
                RushingAvgYards: parseFloat(player.$.avg_yards) || 0.0,
                RushingLongest: parseInt(player.$.longest) || 0,
                RushingLongestTD: parseInt(player.$.longest_touchdown) || 0,
                RushingTDs: parseInt(player.$.touchdowns) || 0,
                RushingRedZoneAttempts: parseInt(player.$.redzone_attempts) || 0,
                RushingTlost: parseInt(player.$.tlost) || 0,
                RushingTlostYards: parseInt(player.$.tlost_yards) || 0,
            });
            break;
        case 'receiving':
            Object.assign(playerStats, {
                ReceivingTargets: parseInt(player.$.targets) || 0,
                Receptions: parseInt(player.$.receptions) || 0,
                ReceivingYards: parseInt(player.$.yards) || 0,
                ReceivingAvgYards: parseFloat(player.$.avg_yards) || 0.0,
                ReceivingLongest: parseInt(player.$.longest) || 0,
                ReceivingLongestTD: parseInt(player.$.longest_touchdown) || 0,
                ReceivingTDs: parseInt(player.$.touchdowns) || 0,
                YardsAfterCatch: parseInt(player.$.yards_after_catch) || 0,
                RedZoneTargets: parseInt(player.$.redzone_targets) || 0,
                AirYards: parseInt(player.$.air_yards) || 0,
            });
            break;
        case 'passing':
            Object.assign(playerStats, {
                PassingAttempts: parseInt(player.$.attempts) || 0,
                PassingCompletions: parseInt(player.$.completions) || 0,
                PassingYards: parseInt(player.$.yards) || 0,
                PassingTouchdowns: parseInt(player.$.touchdowns) || 0,
                PassingInterceptions: parseInt(player.$.interceptions) || 0,
                PassingLongest: parseInt(player.$.longest) || 0,
                PassingSacks: parseInt(player.$.sacks) || 0,
                PassingSackYards: parseInt(player.$.sack_yards) || 0,
                PassingLongestTouchdown: parseInt(player.$.longest_touchdown) || 0,
            });
            break;
        case 'kick_returns':
            Object.assign(playerStats, {
                KickReturns: parseInt(player.$.returns) || 0,
                KickReturnYards: parseInt(player.$.yards) || 0,
                KickReturnAvgYards: parseFloat(player.$.avg_yards) || 0.0,
                KickReturnLongest: parseInt(player.$.longest) || 0,
                KickReturnTDs: parseInt(player.$.touchdowns) || 0,
                KickReturnLongestTD: parseInt(player.$.longest_touchdown) || 0,
                Faircatches: parseInt(player.$.faircatches) || 0,
            });
            break;
        case 'punt_returns':
            Object.assign(playerStats, {
                PuntReturns: parseInt(player.$.returns) || 0,
                PuntReturnYards: parseInt(player.$.yards) || 0,
                PuntReturnAvgYards: parseFloat(player.$.avg_yards) || 0.0,
                PuntReturnLongest: parseInt(player.$.longest) || 0,
                PuntReturnTDs: parseInt(player.$.touchdowns) || 0,
                PuntReturnLongestTD: parseInt(player.$.longest_touchdown) || 0,
            });
            break;
        case 'int_returns':
            Object.assign(playerStats, {
                INTReturns: parseInt(player.$.returns) || 0,
                INTReturnYards: parseInt(player.$.yards) || 0,
                INTReturnAvgYards: parseFloat(player.$.avg_yards) || 0.0,
                INTReturnLongest: parseInt(player.$.longest) || 0,
                INTReturnTDs: parseInt(player.$.touchdowns) || 0,
                INTReturnLongestTD: parseInt(player.$.longest_touchdown) || 0,
            });
            break;
        case 'fumbles':
            Object.assign(playerStats, {
                Fumbles: parseInt(player.$.fumbles) || 0,
                LostFumbles: parseInt(player.$.lost_fumbles) || 0,
                OwnRec: parseInt(player.$.own_rec) || 0,
                OwnRecYards: parseInt(player.$.own_rec_yards) || 0,
                OppRec: parseInt(player.$.opp_rec) || 0,
                OppRecYards: parseInt(player.$.opp_rec_yards) || 0,
                OutOfBounds: parseInt(player.$.out_of_bounds) || 0,
                ForcedFumbles: parseInt(player.$.forced_fumbles) || 0,
                OwnRecTDs: parseInt(player.$.own_rec_tds) || 0,
                OppRecTDs: parseInt(player.$.opp_rec_tds) || 0,
                EZRecTDs: parseInt(player.$.ez_rec_tds) || 0,
            });
            break;
        case 'defense':
            Object.assign(playerStats, {
                Tackles: parseInt(player.$.tackles) || 0,
                Assists: parseInt(player.$.assists) || 0,
                Combined: parseInt(player.$.combined) || 0,
                Sacks: parseFloat(player.$.sacks) || 0.0,
                SackYards: parseFloat(player.$.sack_yards) || 0.0,
                Interceptions: parseInt(player.$.interceptions) || 0,
                PassesDefended: parseInt(player.$.passes_defended) || 0,
                QBHits: parseInt(player.$.qb_hits) || 0,
                TLoss: parseFloat(player.$.tloss) || 0.0,
                TLossYards: parseFloat(player.$.tloss_yards) || 0.0,
                Safeties: parseInt(player.$.safeties) || 0,
                SP_Tackles: parseInt(player.$.sp_tackles) || 0,
                SP_Assists: parseInt(player.$.sp_assists) || 0,
                SP_ForcedFumbles: parseInt(player.$.sp_forced_fumbles) || 0,
                SP_FumbleRecoveries: parseInt(player.$.sp_fumble_recoveries) || 0,
                SP_Blocks: parseInt(player.$.sp_blocks) || 0,
                MiscTackles: parseInt(player.$.misc_tackles) || 0,
                MiscAssists: parseInt(player.$.misc_assists) || 0,
                MiscForcedFumbles: parseInt(player.$.misc_forced_fumbles) || 0,
                MiscFumbleRecoveries: parseInt(player.$.misc_fumble_recoveries) || 0,
            });
            break;
        case 'misc_returns':
            Object.assign(playerStats, {
                MiscReturns: parseInt(player.$.returns) || 0,
                MiscReturnYards: parseInt(player.$.yards) || 0,
                MiscReturnTDs: parseInt(player.$.touchdowns) || 0,
                MiscReturnLongestTD: parseInt(player.$.longest_touchdown) || 0,
                BlkFGTDs: parseInt(player.$.blk_fg_touchdowns) || 0,
                BlkPuntTDs: parseInt(player.$.blk_punt_touchdowns) || 0,
                FGReturnTDs: parseInt(player.$.fg_return_touchdowns) || 0,
            });
            break;
        case 'conversions':
            Object.assign(playerStats, {
                ConversionsPassAttempts: parseInt(player.$.pass_attempts) || 0,
                ConversionsPassSuccesses: parseInt(player.$.pass_successes) || 0,
                ConversionsRushAttempts: parseInt(player.$.rush_attempts) || 0,
                ConversionsRushSuccesses: parseInt(player.$.rush_successes) || 0,
                ConversionsReceiveAttempts: parseInt(player.$.receive_attempts) || 0,
                ConversionsReceiveSuccesses: parseInt(player.$.receive_successes) || 0,
                ConversionsDefenseAttempts: parseInt(player.$.defense_attempts) || 0,
                ConversionsDefenseSuccesses: parseInt(player.$.defense_successes) || 0,
                ConversionsTurnoverSuccesses: parseInt(player.$.turnover_successes) || 0,
            });
            break;
    }

    return playerStats;
};

const buildTeamStats = (teamXml, gameID) => {
    console.log(`Building team stats for Game ID: ${gameID}`);

    if (!teamXml) {
        console.error('teamXml is undefined or null');
        return {};
    }

    return {
        AvgGain: parseFloat(teamXml.$.avg_gain) ?? 0.0,
        Turnovers: parseInt(teamXml.$.turnovers) ?? 0,
        PlayCount: parseInt(teamXml.$.play_count) ?? 0,
        RushPlays: parseInt(teamXml.$.rush_plays) ?? 0,
        TotalYards: parseInt(teamXml.$.total_yards) ?? 0,
        Fumbles: parseInt(teamXml.$.fumbles) ?? 0,
        Penalties: parseInt(teamXml.$.penalties) ?? 0,
        RushingAttempts: parseInt(teamXml.rushing[0].$.attempts) ?? 0,
        RushingYards: parseInt(teamXml.rushing[0].$.yards) ?? 0,
        RushingTouchdowns: parseInt(teamXml.rushing[0].$.touchdowns) ?? 0,
        ReceivingTargets: parseInt(teamXml.receiving[0].$.targets) ?? 0,
        Receptions: parseInt(teamXml.receiving[0].$.receptions) ?? 0,
        ReceivingYards: parseInt(teamXml.receiving[0].$.yards) ?? 0,
        ReceivingTouchdowns: parseInt(teamXml.receiving[0].$.touchdowns) ?? 0,
        Tackles: parseInt(teamXml.defense[0].$.tackles) ?? 0,
        Assists: parseInt(teamXml.defense[0].$.assists) ?? 0,
        Combined: parseInt(teamXml.defense[0].$.combined) ?? 0,
        Sacks: parseFloat(teamXml.defense[0].$.sacks) ?? 0.0,
        Interceptions: parseInt(teamXml.defense[0].$.interceptions) ?? 0,
        PassesDefended: parseInt(teamXml.defense[0].$.passes_defended) ?? 0,
        ForcedFumbles: parseInt(teamXml.defense[0].$.forced_fumbles) ?? 0,
        Tloss: parseFloat(teamXml.defense[0].$.tloss) ?? 0.0,
        GoalToGoAttempts: parseInt(teamXml.efficiency[0].goaltogo[0].$.attempts) ?? 0,
        GoalToGoSuccesses: parseInt(teamXml.efficiency[0].goaltogo[0].$.successes) ?? 0,
        RedZoneAttempts: parseInt(teamXml.efficiency[0].redzone[0].$.attempts) ?? 0,
        RedZoneSuccesses: parseInt(teamXml.efficiency[0].redzone[0].$.successes) ?? 0,
        ThirdDownAttempts: parseInt(teamXml.efficiency[0].thirddown[0].$.attempts) ?? 0,
        ThirdDownSuccesses: parseInt(teamXml.efficiency[0].thirddown[0].$.successes) ?? 0,
        FourthDownAttempts: parseInt(teamXml.efficiency[0].fourthdown[0].$.attempts) ?? 0,
        FourthDownSuccesses: parseInt(teamXml.efficiency[0].fourthdown[0].$.successes) ?? 0,
    };
};

const processAllGames = async () => {
    let lastRequestTime = Date.now();

    try {
        const gameIDs = await fetchGameIDs();
        const startIndex = gameIDs.indexOf('a0e328ae-49ad-4936-b458-b2a47c787ad6');
        // const startIndex = 0;
        if (startIndex === -1) {
            console.error('Starting game ID not found.');
            return;
        }
        const totalGames = gameIDs.length;
        let processedGames = startIndex;

        for (let i = startIndex; i < gameIDs.length; i++) {
            const gameID = gameIDs[i];

            // Wait if necessary before processing the next game
            await throttleRequests(lastRequestTime, 1.1);
            lastRequestTime = Date.now(); // Update lastRequestTime to now after waiting

            try {
                await processGameStats(gameID);
                processedGames++;
                console.log(`Successfully processed game with ID: ${gameID}. Processed ${processedGames} out of ${totalGames} games. (${(processedGames/totalGames)*100}%)`);
            } catch (e) {
                console.error(`Error processing game with ID ${gameID}:`, e);
            }
        }
        console.log('Finished processing all games.');
    } catch (error) {
        console.error('An error occurred fetching game IDs:', error);
    }
};

const throttleRequests = async (lastRequestTime, intervalInSeconds) => {
    const currentTime = Date.now();
    const timeSinceLastRequest = (currentTime - lastRequestTime) / 1000; // Time in seconds

    if (timeSinceLastRequest < intervalInSeconds) {
        const waitTime = (intervalInSeconds - timeSinceLastRequest) * 1000;
        //console.log(`Throttling requests: waiting for ${waitTime} milliseconds.`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
    } else {
        //console.log("No wait needed, proceeding with the request.");
    }
};

const processSingleGameForTesting = async () => {
    try {
        // Use a specific game ID here for testing
        const testGameID = '0095ceaa-2d3c-4ad0-9e69-21ee1ecac246';
        await processGameStats(testGameID);
        console.log(`Finished processing game with ID: ${testGameID}.`);
    } catch (error) {
        console.error('An error occurred:', error);
    }
};

connection.on('connect', async err => {
    connectionStateManager.isReady = !err;
    if (err) {
        console.error('Error connecting to the database:', err);
        return;
    }
    try {
        await processAllGames();
        // await processSingleGameForTesting();
    } catch (error) {
        console.error('An error occurred during processing:', error);
    }
});

connection.connect();
