require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Pool } = require('pg');

// Database setup
const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'schedule_app',
  password: process.env.DB_PASSWORD || 'postgres',
  port: process.env.DB_PORT || 5433,
});


//debugg start
// Log DB connection parameters (remove in production)
console.log('Database connection parameters:', {
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT,
  // Don't log password
});

// Test DB connection on startup
pool.query('SELECT NOW()', (err, result) => {
  if (err) {
    console.error('Database connection failed:', err.message);
  } else {
    console.log('Database connected successfully at:', result.rows[0].now);
  }
});
//debugg end

// Initialize express app
const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(morgan('dev')); // Request logging
app.use(express.json()); // Parse JSON requests


//debugg start
// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Database connection test endpoint
app.get('/db-test', async (req, res) => {
  try {
    // Run a simple query
    const result = await pool.query('SELECT NOW() as time');
    res.json({ 
      success: true, 
      message: 'Database connection successful', 
      data: result.rows[0],
      database: process.env.DB_NAME
    });
  } catch (error) {
    console.error('Database connection error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Database connection failed', 
      error: error.message 
    });
  }
});

//debugg end

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Scheduling API Server' });
});

// Export app and pool
module.exports = { app, pool };