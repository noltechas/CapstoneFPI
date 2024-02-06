const { getQbCompletionPercentage } = require('./qb-completion-percentage');

// Example usage
getQbCompletionPercentage('e9e4c381-0730-4f56-9070-20b585ee9080', 2013, 9, 'lastGame')
    .then(percentage => console.log('QB Completion Percentage:', percentage))
    .catch(error => console.error('Error:', error));
