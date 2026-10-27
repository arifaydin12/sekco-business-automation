// Creates the first administrator account.
// Usage: node scripts/create-admin.js "Admin Name" admin@example.com "a-strong-password"
require('dotenv').config();

const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

(async () => {
    const [name, email, password] = process.argv.slice(2);
    if (!name || !email || !password) {
        console.error('Usage: node scripts/create-admin.js "Admin Name" admin@example.com "password"');
        process.exit(1);
    }
    if (password.length < 8) {
        console.error('Password must be at least 8 characters long.');
        process.exit(1);
    }

    const db = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'sekco_db'
    });

    const hash = await bcrypt.hash(password, 10);
    await db.execute(
        "INSERT INTO users (name, email, password_hash, role, status) VALUES (?, ?, ?, 'Admin', 'Active')",
        [name, email, hash]
    );
    console.log(`Admin user created: ${email}`);
    await db.end();
})().catch(err => {
    console.error(err.message);
    process.exit(1);
});
