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

// Function to fetch all team IDs
const fetchTeamIDs = () => {
    return new Promise((resolve, reject) => {
        const sql = 'SELECT TeamID FROM Teams';
        const teamIDs = [];
        const sqlRequest = new Request(sql, (err) => {
            if (err) {
                console.error('Error fetching team IDs:', err);
                return reject(err);
            }
        });

        sqlRequest.on('row', (columns) => {
            teamIDs.push(columns[0].value);
        });

        sqlRequest.on('requestCompleted', () => {
            resolve(teamIDs);
        });

        connection.execSql(sqlRequest);
    });
};

const insertOrUpdatePlayerData = async (playerData, year) => {
    const tableName = "Players";
    let columns = Object.keys(playerData).concat("Year");
    let placeholders = columns.map(key => `@${key}`);

    // Attempt to insert new data
    let sql = `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders.join(", ")})`;

    // Prepare the update statement dynamically based on playerData
    const updateAssignments = columns.filter(key => {
        // Exclude non-numeric and identifier columns from the dynamic update logic
        return !["Year", "PlayerID", "Name", "Position", "TeamID"].includes(key);
    }).map(key => {
        // Construct a CASE statement for numeric columns to only update if the new value is greater
        return `${key} = CASE WHEN @${key} > 0 THEN @${key} ELSE ${key} END`;
    }).join(", ");


    const updateSql = `UPDATE ${tableName} SET ${updateAssignments} WHERE PlayerID = @PlayerID AND Year = @Year`;

    const execSql = (sql, parameters) => {
        return new Promise((resolve, reject) => {
            const request = new Request(sql, (err) => {
                if (err) {
                    return reject(err);
                }
                resolve();
            });

            // Bind parameters
            parameters.forEach(({ name, type, value }) => {
                request.addParameter(name, type, value);
            });

            connection.execSql(request);
        });
    };

    // Parameters for both insert and update
    const parameters = columns.map(key => {
        let value = playerData[key] || 0; // Ensure we have a default value of 0
        let type = TYPES.VarChar;
        if (typeof value === 'number') {
            type = Number.isInteger(value) ? TYPES.Int : TYPES.Float;
        }
        return { name: key, type, value };
    });

    try {
        await execSql(sql, parameters);
    } catch (error) {
        if (error.number === 2627) { // Primary key violation error code
            try {
                await execSql(updateSql, parameters);
            } catch (updateError) {
                console.error(`Error updating data for player ${playerData.PlayerID} in ${year}:`, updateError);
            }
        } else {
            console.error(`Error inserting data for player ${playerData.PlayerID} in ${year}:`, error);
        }
    }
};

// Modified function to fetch and store player data for Nebraska from 2013 to 2023
const fetchAndStorePlayerDataForYear = (teamID, year) => {
    const url = `http://api.sportradar.us/ncaafb/trial/v7/en/seasons/${year}/REG/teams/${teamID}/statistics.xml?api_key=tcgnnc9k8d6d5g66e625g45d`;

    return new Promise((resolve, reject) => {
        request(url, (error, response, body) => {
            if (error || response.statusCode !== 200) {
                console.error(`Error fetching player data for team ID ${teamID}:`, error || `Status code: ${response.statusCode}`);
                return resolve(); // Resolve to continue processing other years
            }

            parseString(body, async (err, result) => {
                if (err) {
                    console.error('Error parsing XML:', err);
                    return resolve();
                }

                if (!result.season.team[0].player_records || result.season.team[0].player_records.length === 0) {
                    console.log(`No player records found for team ID: ${teamID} in ${year}`);
                    return resolve();
                }

                // Assuming the teamID is correctly assigned from the encompassing team element.
                const correctTeamID = result.season.team[0].$.id;

                const players = result.season.team[0].player_records[0].player;
                for (const player of players) {
                    // Construct playerData object here (same as your current implementation)
                    const playerData = {
                        PlayerID: player.$.id,
                        Name: player.$.name,
                        Position: player.$.position || '',
                        TeamID: correctTeamID,
                        GamesPlayed: player.$.games_played ? parseInt(player.$.games_played) : 0,
                        GamesStarted: player.$.games_started ? parseInt(player.$.games_started) : 0,
                        Penalties: player.penalties ? parseInt(player.penalties[0].$.penalties) : 0,
                        PenaltyYards: player.penalties ? parseInt(player.penalties[0].$.yards) : 0,
                        FirstDowns: player.first_downs ? parseInt(player.first_downs[0].$.first_downs) : 0,
                        Fumbles: player.fumbles ? parseInt(player.fumbles[0].$.fumbles) : 0,
                        LostFumbles: player.fumbles ? parseInt(player.fumbles[0].$.lost_fumbles) : 0,
                        OwnRec: player.fumbles ? parseInt(player.fumbles[0].$.own_rec) : 0,
                        OwnRecYards: player.fumbles ? parseInt(player.fumbles[0].$.own_rec_yards) : 0,
                        OppRec: player.fumbles ? parseInt(player.fumbles[0].$.opp_rec) : 0,
                        OppRecYards: player.fumbles ? parseInt(player.fumbles[0].$.opp_rec_yards) : 0,
                        OutOfBounds: player.fumbles ? parseInt(player.fumbles[0].$.out_of_bounds) : 0,
                        ForcedFumbles: player.fumbles ? parseInt(player.fumbles[0].$.forced_fumbles) : 0,
                        OwnRecTDs: player.fumbles ? parseInt(player.fumbles[0].$.own_rec_tds) : 0,
                        OppRecTDs: player.fumbles ? parseInt(player.fumbles[0].$.opp_rec_tds) : 0,
                        EZRecTDs: player.fumbles ? parseInt(player.fumbles[0].$.ez_rec_tds) : 0,
                        Tackles: player.defense ? parseInt(player.defense[0].$.tackles) : 0,
                        Assists: player.defense ? parseInt(player.defense[0].$.assists) : 0,
                        Combined: player.defense ? parseInt(player.defense[0].$.combined) : 0,
                        Sacks: player.defense ? parseFloat(player.defense[0].$.sacks) : 0.0,
                        SackYards: player.defense ? parseFloat(player.defense[0].$.sack_yards) : 0.0,
                        Interceptions: player.defense ? parseInt(player.defense[0].$.interceptions) : 0,
                        PassesDefended: player.defense ? parseInt(player.defense[0].$.passes_defended) : 0,
                        QBHits: player.defense ? parseInt(player.defense[0].$.qb_hits) : 0,
                        TLoss: player.defense ? parseFloat(player.defense[0].$.tloss) : 0.0,
                        TLossYards: player.defense ? parseFloat(player.defense[0].$.tloss_yards) : 0.0,
                        Safeties: player.defense ? parseInt(player.defense[0].$.safeties) : 0,
                        SP_Tackles: player.defense ? parseInt(player.defense[0].$.sp_tackles) : 0,
                        SP_Assists: player.defense ? parseInt(player.defense[0].$.sp_assists) : 0,
                        SP_ForcedFumbles: player.defense ? parseInt(player.defense[0].$.sp_forced_fumbles) : 0,
                        SP_FumbleRecoveries: player.defense ? parseInt(player.defense[0].$.sp_fumble_recoveries) : 0,
                        SP_Blocks: player.defense ? parseInt(player.defense[0].$.sp_blocks) : 0,
                        MiscTackles: player.defense ? parseInt(player.defense[0].$.misc_tackles) : 0,
                        MiscAssists: player.defense ? parseInt(player.defense[0].$.misc_assists) : 0,
                        MiscForcedFumbles: player.defense ? parseInt(player.defense[0].$.misc_forced_fumbles) : 0,
                        MiscFumbleRecoveries: player.defense ? parseInt(player.defense[0].$.misc_fumble_recoveries) : 0,
                        RushingAttempts: player.rushing ? parseInt(player.rushing[0].$.attempts) : 0,
                        RushingYards: player.rushing ? parseInt(player.rushing[0].$.yards) : 0,
                        RushingAvgYards: player.rushing ? parseFloat(player.rushing[0].$.avg_yards) : 0.0,
                        RushingLongest: player.rushing ? parseInt(player.rushing[0].$.longest) : 0,
                        RushingLongestTD: player.rushing ? parseInt(player.rushing[0].$.longest_touchdown) : 0,
                        RushingTDs: player.rushing ? parseInt(player.rushing[0].$.touchdowns) : 0,
                        RushingRedZoneAttempts: player.rushing ? parseInt(player.rushing[0].$.redzone_attempts) : 0,
                        RushingTlost: player.rushing ? parseInt(player.rushing[0].$.tlost) : 0,
                        RushingTlostYards: player.rushing ? parseInt(player.rushing[0].$.tlost_yards) : 0,
                        ReceivingTargets: player.receiving ? parseInt(player.receiving[0].$.targets) : 0,
                        Receptions: player.receiving ? parseInt(player.receiving[0].$.receptions) : 0,
                        ReceivingYards: player.receiving ? parseInt(player.receiving[0].$.yards) : 0,
                        ReceivingAvgYards: player.receiving ? parseFloat(player.receiving[0].$.avg_yards) : 0.0,
                        ReceivingLongest: player.receiving ? parseInt(player.receiving[0].$.longest) : 0,
                        ReceivingLongestTD: player.receiving ? parseInt(player.receiving[0].$.longest_touchdown) : 0,
                        ReceivingTDs: player.receiving ? parseInt(player.receiving[0].$.touchdowns) : 0,
                        YardsAfterCatch: player.receiving ? parseInt(player.receiving[0].$.yards_after_catch) : 0,
                        RedZoneTargets: player.receiving ? parseInt(player.receiving[0].$.redzone_targets) : 0,
                        AirYards: player.receiving ? parseInt(player.receiving[0].$.air_yards) : 0,

                        KickReturns: player.kick_returns ? parseInt(player.kick_returns[0].$.returns) : 0,
                        KickReturnYards: player.kick_returns ? parseInt(player.kick_returns[0].$.yards) : 0,
                        KickReturnAvgYards: player.kick_returns ? parseFloat(player.kick_returns[0].$.avg_yards) : 0.0,
                        KickReturnLongest: player.kick_returns ? parseInt(player.kick_returns[0].$.longest) : 0,
                        KickReturnTDs: player.kick_returns ? parseInt(player.kick_returns[0].$.touchdowns) : 0,
                        KickReturnLongestTD: player.kick_returns ? parseInt(player.kick_returns[0].$.longest_touchdown) : 0,
                        Faircatches: player.kick_returns ? parseInt(player.kick_returns[0].$.faircatches) : 0,

                        PuntReturns: player.punt_returns ? parseInt(player.punt_returns[0].$.returns) : 0,
                        PuntReturnYards: player.punt_returns ? parseInt(player.punt_returns[0].$.yards) : 0,
                        PuntReturnAvgYards: player.punt_returns ? parseFloat(player.punt_returns[0].$.avg_yards) : 0.0,
                        PuntReturnLongest: player.punt_returns ? parseInt(player.punt_returns[0].$.longest) : 0,
                        PuntReturnTDs: player.punt_returns ? parseInt(player.punt_returns[0].$.touchdowns) : 0,
                        PuntReturnLongestTD: player.punt_returns ? parseInt(player.punt_returns[0].$.longest_touchdown) : 0,

                        INTReturns: player.int_returns ? parseInt(player.int_returns[0].$.returns) : 0,
                        INTReturnYards: player.int_returns ? parseInt(player.int_returns[0].$.yards) : 0,
                        INTReturnAvgYards: player.int_returns ? parseFloat(player.int_returns[0].$.avg_yards) : 0.0,
                        INTReturnLongest: player.int_returns ? parseInt(player.int_returns[0].$.longest) : 0,
                        INTReturnTDs: player.int_returns ? parseInt(player.int_returns[0].$.touchdowns) : 0,
                        INTReturnLongestTD: player.int_returns ? parseInt(player.int_returns[0].$.longest_touchdown) : 0,

                        MiscReturns: player.misc_returns ? parseInt(player.misc_returns[0].$.returns) : 0,
                        MiscReturnYards: player.misc_returns ? parseInt(player.misc_returns[0].$.yards) : 0,
                        MiscReturnTDs: player.misc_returns ? parseInt(player.misc_returns[0].$.touchdowns) : 0,
                        MiscReturnLongestTD: player.misc_returns ? parseInt(player.misc_returns[0].$.longest_touchdown) : 0,

                        BlkFGTDs: player.misc_returns ? parseInt(player.misc_returns[0].$.blk_fg_touchdowns) : 0,
                        BlkPuntTDs: player.misc_returns ? parseInt(player.misc_returns[0].$.blk_punt_touchdowns) : 0,
                        FGReturnTDs: player.misc_returns ? parseInt(player.misc_returns[0].$.fg_return_touchdowns) : 0,

                        ConversionsPassAttempts: player.conversions ? parseInt(player.conversions[0].$.pass_attempts) : 0,
                        ConversionsPassSuccesses: player.conversions ? parseInt(player.conversions[0].$.pass_successes) : 0,
                        ConversionsRushAttempts: player.conversions ? parseInt(player.conversions[0].$.rush_attempts) : 0,
                        ConversionsRushSuccesses: player.conversions ? parseInt(player.conversions[0].$.rush_successes) : 0,
                        ConversionsReceiveAttempts: player.conversions ? parseInt(player.conversions[0].$.receive_attempts) : 0,
                        ConversionsReceiveSuccesses: player.conversions ? parseInt(player.conversions[0].$.receive_successes) : 0,
                        ConversionsDefenseAttempts: player.conversions ? parseInt(player.conversions[0].$.defense_attempts) : 0,
                        ConversionsDefenseSuccesses: player.conversions ? parseInt(player.conversions[0].$.defense_successes) : 0,
                        ConversionsTurnoverSuccesses: player.conversions ? parseInt(player.conversions[0].$.turnover_successes) : 0,

                        // Passing statistics
                        PassingAttempts: player.passing ? parseInt(player.passing[0].$.attempts) || 0 : 0,
                        PassingCompletions: player.passing ? parseInt(player.passing[0].$.completions) || 0 : 0,
                        PassingYards: player.passing ? parseInt(player.passing[0].$.yards) || 0 : 0,
                        PassingTouchdowns: player.passing ? parseInt(player.passing[0].$.touchdowns) || 0 : 0,
                        PassingInterceptions: player.passing ? parseInt(player.passing[0].$.interceptions) || 0 : 0,
                        PassingLongest: player.passing ? parseInt(player.passing[0].$.longest) || 0 : 0,
                        PassingSacks: player.passing ? parseInt(player.passing[0].$.sacks) || 0 : 0,
                        PassingSackYards: player.passing ? parseInt(player.passing[0].$.sack_yards) || 0 : 0,
                        PassingLongestTouchdown: player.passing ? parseInt(player.passing[0].$.longest_touchdown) || 0 : 0,

                    };

                    try {
                        await insertOrUpdatePlayerData(playerData, year);
                    } catch (insertErr) {
                        console.error(`Error inserting data for player ${player.$.id} in ${year}`, insertErr);
                    }
                }
                resolve(); // Ensure this is called to continue processing after the for loop
            });
        });
        console.log(`Inserted players from team ${teamID} for ${year}`);
    });
};

// Adjusted main function
const populateAllPlayers = async () => {
    try {
        const teamIDs = await fetchTeamIDs(); // Fetch all team IDs

        for (let year = 2022; year <= 2023; year++) {
            for (const teamID of teamIDs) {
                await fetchAndStorePlayerDataForYear(teamID, year);
            }
        }

        console.log('Finished populating players for all teams.');
    } catch (error) {
        console.error('An error occurred during population:', error);
    }
};

connection.on('connect', err => {
    if (!err) {
        populateAllPlayers();
    } else {
        console.error(err);
    }
});

connection.connect();