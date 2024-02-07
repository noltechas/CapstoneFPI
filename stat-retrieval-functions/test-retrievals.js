const getStatsForPlayer = require('./retrieve-statistics');

// Define parameters
const playerId = '57946103-c70d-4b1a-a476-2f167ebf1e13';
const year = 2013;
const week = 8;
const period = 'season';
const statNames = ['RushingYards', 'RushingAttempts'];

// Call the function
getStatsForPlayer(playerId, year, week, period, statNames)
    .then(stats => {
        if (stats) {
            // Calculate the completion percentage
            const completionPercentage = (stats.RushingYards / stats.RushingAttempts);
            console.log(stats.RushingYards)
            console.log(stats.RushingAttempts)
            console.log(`Average Rushing Yards per Carry: ${completionPercentage.toFixed(2)}`);
        } else {
            console.log('No stats found.');
        }
    })
    .catch(error => console.error('Error:', error));