const getStatsForPlayer = require('./retrieve-statistics');

// Define parameters
const playerId = '57deb2a8-9f98-462c-b1a9-99522d874b6a';
const year = 2013;
const week = 12;
const period = 'lastGame';
const statNames = ['PassingCompletions', 'PassingAttempts'];

// Call the function
getStatsForPlayer(playerId, year, week, period, statNames)
    .then(stats => {
        if (stats) {
            // Calculate the completion percentage
            const completionPercentage = (stats.PassingCompletions / stats.PassingAttempts) * 100;
            console.log(stats.PassingCompletions)
            console.log(stats.PassingAttempts)
            console.log(`QB Completion Percentage: ${completionPercentage.toFixed(2)}%`);
        } else {
            console.log('No stats found.');
        }
    })
    .catch(error => console.error('Error:', error));