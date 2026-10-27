require('dotenv').config();

const path = require('path');
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('JWT_SECRET is not set. Copy .env.example to .env and fill it in.');
    process.exit(1);
}

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Serve only the front-end folder (never the project root, which holds server code and .env)
app.use(express.static(path.join(__dirname, 'src')));

const db = mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'sekco_db',
    charset: 'utf8mb4'
});

db.connect(err => {
    if (err) {
        console.error('DB connect error:', err);
        return;
    }
    console.log('MySQL connected!');
});

// ============ MIDDLEWARE ============

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) return res.sendStatus(401); // Unauthorized

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403); // Forbidden
        req.user = user;
        next();
    });
};

const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'Admin') return res.sendStatus(403);
    next();
};

// ============ AUTH API (public) ============

app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    const sql = 'SELECT * FROM users WHERE email = ?';
    db.query(sql, [email], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password_hash);

        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        const tokenPayload = { id: user.id, name: user.name, role: user.role };
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '8h' });

        res.json({ message: 'Login successful!', token });
    });
});

// ============ PROTECTED API ============

// Current user
app.get('/api/me', authenticateToken, (req, res) => {
    res.json(req.user);
});

// List users
app.get('/api/users', authenticateToken, (req, res) => {
    const sql = 'SELECT id, name, email, role, status FROM users ORDER BY created_at DESC';
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch users' });
        res.json(results);
    });
});

// Create user (admins only)
app.post('/api/users', authenticateToken, requireAdmin, async (req, res) => {
    const { name, email, role, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = 'INSERT INTO users (name, email, role, status, password_hash) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [name, email, role || 'User', 'Active', hashedPassword], (err) => {
        if (err) return res.status(500).json({ error: 'Failed to add user' });
        res.status(201).json({ message: 'User added successfully!' });
    });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
