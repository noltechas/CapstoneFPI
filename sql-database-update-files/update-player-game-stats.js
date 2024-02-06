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
        const sql = 'SELECT GameID FROM Schedule WHERE SEASON = 2014';
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
    //console.log(`Inserting their stats...`);

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

const processGameStats = async (gameID) => {
    console.log(`Processing game with ID: ${gameID}`);
    try {
        const response = await axios.get(`http://api.sportradar.us/ncaafb/trial/v7/en/games/${gameID}/statistics.xml?api_key=gey93z378rkc9rcp94bhjvbq`);
        const xml = response.data;

        const result = await parseXml(xml); // Use await here

        if (result && result.game && result.game.team) {
            for (const team of result.game.team) {
                const teamID = team.$.id;
                //console.log(`Processing team ${teamID}`);
                for (const category of ['rushing', 'receiving', 'passing', 'penalties', 'kick_returns', 'punt_returns', 'int_returns', 'fumbles', 'defense', 'misc_returns', 'conversions']) {
                    //console.log(`Processing category: ${category}`);

                    if (team[category] && team[category][0] && team[category][0].player) {
                        //console.log(`Length of category: ${team[category][0].player.length}`)
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
        console.log(`Successfully processed game with ID: ${gameID}`);
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

const processAllGames = async () => {
    try {
        const gameIDs = await fetchGameIDs();
        const startIndex = gameIDs.indexOf('6d4c2db3-86fb-451c-9a85-3796db544a2d');
        //const startIndex = 0;
        if (startIndex === -1) {
            console.error('Starting game ID not found.');
            return;
        }
        const totalGames = gameIDs.length;
        let processedGames = 0 + startIndex;
        let lastRequestTime = Date.now();

        for (let i = startIndex; i < gameIDs.length; i++) {
            const gameID = gameIDs[i];
            const currentTime = Date.now();
            const timeSinceLastRequest = (currentTime - lastRequestTime) / 1000; // Time in seconds

            if (timeSinceLastRequest < 1.1) {
                await new Promise(resolve => setTimeout(resolve, (1.1 - timeSinceLastRequest) * 1000)); // Wait the remaining time
            }

            try {
                await processGameStats(gameID);
                processedGames++;
                console.log(`Successfully processed game with ID: ${gameID}. Processed ${processedGames} out of ${totalGames} games (${((processedGames / totalGames) * 100).toFixed(2)}%)`);
            } catch (e) {
                console.error(`Error processing game with ID ${gameID}:`, e);
            }

            lastRequestTime = Date.now(); // Update the last request time after processing and potential waiting
        }
        console.log('Finished processing all games.');
    } catch (error) {
        console.error('An error occurred fetching game IDs:', error);
    }
};

const processSingleGameForTesting = async () => {
    try {
        // Use a specific game ID here for testing
        const testGameID = '00ebbef2-5f9f-4e7f-9b20-25f9d571386c';
        await processGameStats(testGameID);
        // console.log(`Finished processing game with ID: ${testGameID}.`);
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
