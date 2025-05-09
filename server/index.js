const { app, pool } = require('./app');

// Create simple test routes for now
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!' });
});


app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/branches', require('./routes/branches.routes'));
app.use('/api/employees', require('./routes/employees.routes'));
app.use('/api/schedules', require('./routes/schedules.routes'));
app.use('/api/shifts', require('./routes/shifts.routes'));
app.use('/api/availability', require('./routes/availability.routes'));
// In server/index.js or wherever you define your routes
app.use('/api/shift-trades', require('./routes/shift-trades.routes'));

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.statusCode || 500).json({
    error: {
      message: err.message || 'Internal server error',
      status: err.statusCode || 500
    }
  });
});

// Catch-all route for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ 
    message: 'Route not found', 
    path: req.originalUrl 
  });
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
  console.log(`Test API endpoint at http://localhost:${PORT}/api/test`);
});

// Handle shutdown gracefully
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  
  // Close database pool
  pool.end(() => {
    console.log('Database pool closed');
    process.exit(0);
  });
});