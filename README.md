# SEKCO Business Automation

A simple but robust business-automation system for user and project management. It has a secure login with JWT authentication, a dashboard, and an administrator panel for managing users. Built with **Node.js, Express and MySQL**.

## Features

- **JWT authentication**: bcrypt-hashed passwords and signed 8-hour tokens
- **Role-based access**: `Admin`, `Manager` and `User` roles; creating users is restricted to administrators
- **Dashboard** for the signed-in user
- **User management** panel: list users and add new ones
- **Relational schema** for users, projects and tasks, ready for further modules
- The front end is served by the same Express app, so one command starts everything

## Tech stack

| Layer | Technology |
| --- | --- |
| Backend | Node.js, Express 4, `mysql2`, `jsonwebtoken`, `bcrypt`, `dotenv` |
| Database | MySQL 8 |
| Frontend | HTML, CSS, vanilla JavaScript |

## Getting started

**Prerequisites:** Node.js 18+ and MySQL 8.

1. **Create the database**

   ```bash
   mysql -u root -p < database.sql
   ```

2. **Configure the app**

   ```bash
   npm install
   cp .env.example .env     # on Windows: copy .env.example .env
   ```

   Edit `.env` with your MySQL credentials and a long random `JWT_SECRET`:

   ```bash
   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
   ```

3. **Create the first administrator**

   ```bash
   node scripts/create-admin.js "Admin Name" admin@example.com "a-strong-password"
   ```

4. **Run**

   ```bash
   npm start
   ```

   Open [http://localhost:3000](http://localhost:3000) and sign in.

## API

| Method | Endpoint | Access |
| --- | --- | --- |
| POST | `/api/auth/login` | Public |
| GET | `/api/me` | Authenticated |
| GET | `/api/users` | Authenticated |
| POST | `/api/users` | Admin only |

## Project structure

```
server.js              Express app, auth middleware and API
database.sql           MySQL schema (users, projects, tasks)
scripts/create-admin.js  Creates the first administrator
src/                   Front end (login page, dashboard, user table)
.env.example           Required environment variables
```

## Security notes

- The server only serves the `src/` folder, never the project root, so source code and `.env` are not exposed.
- Secrets live in environment variables; `.env` is git-ignored.
- The server refuses to start without a `JWT_SECRET`.

## License

[MIT](LICENSE) © Arif Enes
