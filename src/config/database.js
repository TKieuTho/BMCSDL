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
        encrypt: true,
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
            console.log('Attempting to connect to database with config:', {
                server: config.server,
                database: config.database,
                user: config.user,
                port: config.port
            });
            
            // Try to connect with Windows Authentication first
            try {
                pool = await sql.connect({
                    ...config,
                    options: {
                        ...config.options,
                        trustedConnection: true,
                        trustServerCertificate: true
                    }
                });
                console.log('Connected to database successfully using Windows Authentication');
            } catch (windowsAuthError) {
                console.log('Windows Authentication failed, trying SQL Server Authentication...');
                // If Windows Authentication fails, try SQL Server Authentication
                pool = await sql.connect(config);
                console.log('Connected to database successfully using SQL Server Authentication');
            }
        }
        return pool;
    } catch (err) {
        console.error('Database connection failed:', err);
        if (err.code === 'ETIMEOUT') {
            console.error('Connection timed out. Please check if SQL Server is running and accessible.');
            console.error('Troubleshooting steps:');
            console.error('1. Make sure SQL Server is running');
            console.error('2. Check if you can connect using SQL Server Management Studio');
            console.error('3. Verify the server name and port');
            console.error('4. Check if SQL Server Browser service is running');
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
        }
        return pool;
    } catch (err) {
        console.error('Error getting database connection:', err);
        throw err;
    }
}

module.exports = {
    sql,
    connectDB,
    getConnection
};