const { Connection } = require('tedious');

// Configuration for your Azure SQL Database
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
        encrypt: true,
        connectTimeout: 300000
    }
};

const connection = new Connection(config);
let connectPromiseResolve, connectPromiseReject;
const connectPromise = new Promise((resolve, reject) => {
    connectPromiseResolve = resolve;
    connectPromiseReject = reject;
});

connection.on('connect', err => {
    if (err) {
        console.error('Error connecting to the database:', err);
        connectPromiseReject(err);
    } else {
        console.log("Connected to the database.");
        connectPromiseResolve(connection);
    }
});

connection.connect();

module.exports = {
    connection,
    connectPromise,
    config
};