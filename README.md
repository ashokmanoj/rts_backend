# RTS Backend — Node.js + Express + PostgreSQL

## Folder Structure

```
rts-backend/
├── src/
│   ├── server.js                  ← Entry point
│   ├── db/
│   │   ├── pool.js                ← PostgreSQL connection pool
│   │   ├── schema.sql             ← All CREATE TABLE statements
│   │   └── init.js                ← Runs schema + seeds demo users
│   ├── middleware/
│   │   ├── auth.js                ← JWT authenticate + authorize guards
│   │   ├── upload.js              ← Multer file upload config
│   │   └── errorHandler.js        ← Global Express error handler
│   ├── controllers/
│   │   ├── authController.js      ← login, me
│   │   ├── requestController.js   ← getAll, create, approval, seen, unread, close
│   │   └── chatController.js      ← getMessages, sendMessage
│   ├── routes/
│   │   ├── auth.js                ← /api/auth/*
│   │   └── requests.js            ← /api/requests/* + /api/requests/:id/chat/*
│   └── utils/
│       └── formatters.js          ← DB row → frontend object converters
├── uploads/                       ← Saved files (auto-created)
├── .env.example                   ← Copy to .env and fill in values
├── .gitignore
└── package.json
```

## Quick Start

### 1. Create the PostgreSQL database

```bash
psql -U postgres
CREATE DATABASE rts_db;
\q
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:
```
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rts_db
DB_USER=postgres
DB_PASSWORD=your_actual_password
JWT_SECRET=some_long_random_string_here
JWT_EXPIRES_IN=7d
UPLOAD_DIR=uploads
MAX_FILE_SIZE_MB=10
CLIENT_URL=http://localhost:5173
```

### 3. Install dependencies

```bash
npm install
```

### 4. Initialise database (creates tables + demo users)

```bash
npm run db:init
```

### 5. Start the server

```bash
npm run dev      # development (auto-restart with nodemon)
npm start        # production
```

Server runs at: `http://localhost:5000`

---

## Demo Users (seeded by db:init)

| Email             | Password    | Role     |
|-------------------|-------------|----------|
| brad@rts.com      | password123 | Employee |
| john@rts.com      | password123 | RM       |
| hod@rts.com       | password123 | HOD      |
| admin@rts.com     | password123 | Admin    |
| tarant@rts.com    | password123 | Employee |

---

## API Reference

All routes except `/api/auth/login` require:
```
Authorization: Bearer <JWT_TOKEN>
```

### Auth

| Method | Endpoint         | Body                    | Response          |
|--------|------------------|-------------------------|-------------------|
| POST   | /api/auth/login  | `{ email, password }`   | `{ token, user }` |
| GET    | /api/auth/me     | —                       | `{ user }`        |

### Requests

| Method | Endpoint                        | Body / File              | Response    |
|--------|---------------------------------|--------------------------|-------------|
| GET    | /api/requests                   | —                        | Request[]   |
| POST   | /api/requests                   | multipart: purpose, dept, description, file? | Request |
| PATCH  | /api/requests/:id/approval      | `{ decision, comment, newDept? }` | Request |
| PATCH  | /api/requests/:id/seen          | —                        | `{ ok: true }` |
| PATCH  | /api/requests/:id/unread        | —                        | `{ ok: true }` |
| PATCH  | /api/requests/:id/close         | multipart: note, file?   | Request     |

`decision` values: `Approved` | `Rejected` | `Checking` | `Forwarded`

### Chat

| Method | Endpoint                  | Body / File                        | Response      |
|--------|---------------------------|------------------------------------|---------------|
| GET    | /api/requests/:id/chat    | —                                  | ChatMessage[] |
| POST   | /api/requests/:id/chat    | multipart: type, text?, file?, duration? | ChatMessage |

`type` values: `message` | `file` | `voice` | `mixed` | `approval`

---

## Connect to Frontend

In your frontend `.env`:
```
VITE_API_URL=http://localhost:5000/api
```

Then in each frontend service file, uncomment the `// BACKEND MODE` blocks.
