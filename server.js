const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken'); // Yeni eklendi

const app = express();
const port = 3000;
const JWT_SECRET = 'your_super_secret_key_12345'; // Gerçek projede .env dosyasında saklanmalı

app.use(express.json());
app.use(cors());

// ÖNEMLİ: Frontend dosyalarını sunmak için
// Projenizin ana klasöründe dosyalarınız olduğunu varsayıyorum.
// Eğer bir `public` veya `src` klasöründeyse, ona göre güncelleyin.
app.use(express.static('.'));

const db = mysql.createConnection({
    host: 'localhost', user: 'root', password: '', database: 'sekco_db', charset: 'utf8mb4'
});

db.connect(err => {
    if (err) { console.error('DB connect error:', err); return; }
    console.log('MySQL connected!');
});

// Middleware: API isteklerini doğrulamak için
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

// ============ AUTH API ENDPOINTS (Public) ============

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

// ============ PROTECTED API ENDPOINTS (Giriş Gerektiren) ============

// Giriş yapmış kullanıcının bilgilerini getiren API
app.get('/api/me', authenticateToken, (req, res) => {
    res.json(req.user);
});

// Tüm kullanıcıları getiren API
app.get('/api/users', authenticateToken, (req, res) => {
    // İleride yetkilendirme eklenebilir: if(req.user.role !== 'Admin') return res.sendStatus(403);
    const sql = 'SELECT id, name, email, role, status FROM users ORDER BY created_at DESC';
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Failed to fetch users' });
        res.json(results);
    });
});

// Yeni kullanıcı ekleyen API (Sadece Adminler için olmalı - yetkilendirme sonraki adım)
app.post('/api/users', authenticateToken, async (req, res) => {
    const { name, email, role, password } = req.body;
    if (!name || !email || !password) {
        return res.status(400).json({ error: 'All fields are required' });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = 'INSERT INTO users (name, email, role, status, password_hash) VALUES (?, ?, ?, ?, ?)';
    db.query(sql, [name, email, role || 'User', 'Active', hashedPassword], (err, result) => {
        if (err) return res.status(500).json({ error: 'Failed to add user' });
        res.status(201).json({ message: 'User added successfully!' });
    });
});

// Diğer API'larınız... (PUT, DELETE etc. authenticateToken eklenmeli)
// app.put('/api/users/:id', authenticateToken, ...);
// app.delete('/api/users/:id', authenticateToken, ...);

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});