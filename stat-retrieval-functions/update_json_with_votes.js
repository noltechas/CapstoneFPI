const fs = require('fs');
const { Connection, Request, TYPES } = require('tedious');
const JSONStream = require('JSONStream');
const config = require('./databaseConnection').config;


const retryDelay = 10000; // Delay between retry attempts (in milliseconds)
const maxRetries = 5; // Maximum number of retry attempts

const getTeamVotes = async (teamID, season, week, pollType) => {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            const votes = await new Promise((resolve, reject) => {
                const connection = new Connection(config);

                connection.on('connect', (err) => {
                    if (err) {
                        console.error(err);
                        return reject(err);
                    }

                    const sql = `SELECT Points FROM POLLS WHERE TeamID = @TeamID AND Season = @Season AND Week = @Week AND Type = @Type`;
                    const request = new Request(sql, (err, rowCount) => {
                        if (err) {
                            console.error(err);
                            connection.close();
                            return reject(err);
                        }
                        if (rowCount === 0) {
                            resolve(0);
                        }
                    });

                    request.addParameter('TeamID', TYPES.NVarChar, teamID);
                    request.addParameter('Season', TYPES.Int, season);
                    request.addParameter('Week', TYPES.Int, week);
                    request.addParameter('Type', TYPES.VarChar, pollType);

                    let votes = 0;
                    request.on('row', (columns) => {
                        votes = columns[0].value;
                    });

                    request.on('requestCompleted', () => {
                        connection.close();
                        resolve(votes);
                    });

                    connection.execSql(request);
                });

                connection.connect();
            });
            return votes;
        } catch (error) {
            retries++;
            if (retries === maxRetries) {
                throw error;
            }
            console.log(`Retry attempt ${retries} for getTeamVotes...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
    }
};

const processGame = async (game) => {
    let retries = 0;
    while (retries < maxRetries) {
        try {
            await new Promise((resolve, reject) => {
                const connection = new Connection(config);

                connection.on('connect', (err) => {
                    if (err) {
                        console.error(err);
                        return reject(err);
                    }

                    const sql = `SELECT HomeTeamID, AwayTeamID FROM SCHEDULE WHERE GameID = @GameID`;
                    const request = new Request(sql, async (err, rowCount) => {
                        if (err) {
                            console.error(err);
                            connection.close();
                            return reject(err);
                        }
                        if (rowCount === 0) {
                            console.log(`No matching game found for GameID: ${game.GameID}`);
                            connection.close();
                            return resolve();
                        }

                        const { GameID, Season, Week } = game;

                        const homeAPVotes = await getTeamVotes(game.HomeTeamID, Season, Week, 'AP');
                        const awayAPVotes = await getTeamVotes(game.AwayTeamID, Season, Week, 'AP');
                        const homeFCSVotes = await getTeamVotes(game.HomeTeamID, Season, Week, 'FCS');
                        const awayFCSVotes = await getTeamVotes(game.AwayTeamID, Season, Week, 'FCS');

                        game.HomeAPVotes = homeAPVotes;
                        game.AwayAPVotes = awayAPVotes;
                        game.HomeFCSVotes = homeFCSVotes;
                        game.AwayFCSVotes = awayFCSVotes;

                        console.log(`Updated game ${game.GameID} - HomeAPVotes: ${homeAPVotes}, AwayAPVotes: ${awayAPVotes}, HomeFCSVotes: ${homeFCSVotes}, AwayFCSVotes: ${awayFCSVotes}`);
                        connection.close();
                        resolve();
                    });

                    request.addParameter('GameID', TYPES.NVarChar, game.GameID);

                    request.on('row', (columns) => {
                        game.HomeTeamID = columns[0].value;
                        game.AwayTeamID = columns[1].value;
                    });

                    connection.execSql(request);
                });

                connection.connect();
            });
            return;
        } catch (error) {
            retries++;
            if (retries === maxRetries) {
                throw error;
            }
            console.log(`Retry attempt ${retries} for processGame...`);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
        }
    }
};

const updateGameData = async () => {
    const jsonFilePath = 'full_game_stats_for_dnn.json';
    const outputFilePath = 'full_game_stats_for_dnn_polls.json';

    let existingGames = [];
    let isValid = true;

    if (fs.existsSync(outputFilePath)) {
        const readStream = fs.createReadStream(outputFilePath, { encoding: 'utf8' });
        const jsonStream = JSONStream.parse('*');

        readStream.pipe(jsonStream);

        await new Promise((resolve, reject) => {
            jsonStream.on('data', (game) => {
                existingGames.push(game);
            });

            jsonStream.on('end', () => {
                resolve();
            });

            jsonStream.on('error', (err) => {
                console.log('Error parsing existing JSON data:', err);
                isValid = false;
                reject(err);
            });
        });
    }

    const existingGameIds = new Set(existingGames.map((game) => game.GameID));

    const readStream = fs.createReadStream(jsonFilePath, { encoding: 'utf8' });
    const writeStream = fs.createWriteStream(outputFilePath, { flags: isValid ? 'a' : 'w' });

    let isFirst = !isValid || existingGames.length === 0;

    const jsonStream = JSONStream.parse('*');

    jsonStream.on('data', async (game) => {
        if (!existingGameIds.has(game.GameID)) {
            await processGame(game);

            if (isFirst) {
                writeStream.write(JSON.stringify(game));
                isFirst = false;
            } else {
                writeStream.write(',\n' + JSON.stringify(game));
            }
        }
    });

    jsonStream.on('end', () => {
        if (!isFirst) {
            writeStream.write(']');
        }
        writeStream.end();
        console.log('JSON file updated successfully.');
    });

    if (isFirst) {
        writeStream.write('[\n');
    }
    readStream.pipe(jsonStream);
};

updateGameData();