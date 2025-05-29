// config/database.js
require('dotenv').config();
const sql = require('mssql');

// Log environment variables (without sensitive data)
console.log('Environment variables loaded:', {
    server: process.env.DB_SERVER,
    database: process.env.DB_DATABASE,
    port: process.env.DB_PORT,
    user: process.env.DB_USER ? '***' : undefined
});

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER || 'localhost',
    database: process.env.DB_DATABASE || 'QLSVNhom',
    port: parseInt(process.env.DB_PORT || '1433'),
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        connectTimeout: 30000, // 30 seconds
        requestTimeout: 30000, // 30 seconds
        pool: {
            max: 10,
            min: 0,
            idleTimeoutMillis: 30000
        }
    }
};

let pool;

async function connectDB() {
    try {
        if (!pool) {
            console.log('Creating new connection pool...');
            pool = await new sql.ConnectionPool(config).connect();
            console.log('Connection pool created successfully');

            // Handle pool errors
            pool.on('error', async (err) => {
                console.error('Pool error:', err);
                if (err.code === 'ECONNCLOSED') {
                    console.log('Attempting to reconnect...');
                    try {
                        pool = await new sql.ConnectionPool(config).connect();
                        console.log('Reconnected successfully');
                    } catch (reconnectErr) {
                        console.error('Reconnection failed:', reconnectErr);
                    }
                }
            });
        }
        return pool;
    } catch (err) {
        console.error('Database connection failed:', err);
        if (err.code === 'ETIMEOUT') {
            console.error('Connection timed out. Please check if SQL Server is running and accessible.');
        } else if (err.code === 'ELOGIN') {
            console.error('Login failed. Please check your credentials.');
        }
        throw err;
    }
}

async function getConnection() {
    try {
        if (!pool) {
            await connectDB();
        } else if (!pool.connected) {
            console.log('Pool disconnected, reconnecting...');
            await connectDB();
        }
        return pool;
    } catch (err) {
        console.error('Error getting database connection:', err);
        throw err;
    }
}

// Handle application shutdown
process.on('SIGINT', async () => {
    if (pool) {
        try {
            await pool.close();
            console.log('Database connection pool closed');
        } catch (err) {
            console.error('Error closing connection pool:', err);
        }
    }
    process.exit(0);
});

module.exports = {
    sql,
    config,
    connectDB,
    getConnection
};