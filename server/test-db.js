const { Client } = require('pg');

// Use Client instead of Pool for a simpler test
const client = new Client({
  user: 'postgres',
  host: 'localhost',
  database: 'schedule_app',
  password: 'agar8815',
  port: 5432
});

client.connect()
  .then(() => console.log('Connected to database!'))
  .then(() => client.query('SELECT NOW()'))
  .then(res => console.log('Database time:', res.rows[0].now))
  .catch(err => console.error('Error:', err))
  .finally(() => client.end());