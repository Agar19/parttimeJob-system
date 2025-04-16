const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../app');

/**
 * User login
 */
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    console.log("Login attempt:", email);//debuggggggg

    // Input validation
    if (!email || !password) {
      return res.status(400).json({ 
        error: { message: 'Email and password are required' } 
      });
    }

    // Check if user exists
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
//debugggggg
    console.log("User found:", userResult.rows.length > 0);

    const user = userResult.rows[0];
    if (!user) {
      return res.status(401).json({ 
        error: { message: 'Invalid credentials' } 
      });
    }
//debugggggg
    console.log("Stored password hash:", user.password);

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);

    console.log("Password valid:", validPassword);//debugggggg

    if (!validPassword) {
      return res.status(401).json({ 
        error: { message: 'Invalid credentials' } 
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your_jwt_secret_key_here',
      { expiresIn: '24h' }
    );

    // Fetch additional user data based on role
    let additionalData = {};
    
    if (user.role === 'Manager') {
      const branchesResult = await pool.query(
        'SELECT id, name, location FROM branches WHERE manager_id = $1',
        [user.id]
      );
      additionalData.branches = branchesResult.rows;
    } else if (user.role === 'Employee') {
      const employeeResult = await pool.query(
        `SELECT e.id, e.branch_id, b.name as branch_name 
         FROM employees e
         JOIN branches b ON e.branch_id = b.id
         WHERE e.user_id = $1`,
        [user.id]
      );
      additionalData.employee = employeeResult.rows[0];
    }

    // Send response
    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
        ...additionalData
      },
      token
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Register new user (typically used for admin or setup)
 */
exports.register = async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body;

    // Input validation
    if (!name || !email || !password || !role) {
      return res.status(400).json({ 
        error: { message: 'Name, email, password, and role are required' } 
      });
    }

    // Check if user already exists
    const userExists = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userExists.rows.length > 0) {
      return res.status(400).json({ 
        error: { message: 'User with that email already exists' } 
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user
    const newUser = await pool.query(
      `INSERT INTO users (name, email, password, role, phone, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) 
       RETURNING id, name, email, role, phone, created_at`,
      [name, email, hashedPassword, role, phone || null]
    );

    res.status(201).json({
      message: 'User registered successfully',
      user: newUser.rows[0]
    });
  } catch (error) {
    next(error);
  }
};