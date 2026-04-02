# RTS Backend — Setup Guide (Prisma Edition)

## You are replacing your old `rts-fixed-backend` with these files.

---

## Step 1 — Copy these files INTO your existing `rts-fixed-backend` folder

Replace everything except your `uploads/` folder (keep that — it has your files).

```
rts-fixed-backend/
  .env                  ← REPLACE (has your DB credentials in Prisma format)
  package.json          ← REPLACE (has correct npm scripts)
  prisma/
    schema.prisma       ← NEW
  src/
    db/
      prisma.js         ← NEW (replaces pool.js)
      seed.js           ← NEW (replaces init.js — seeds 339 users)
    controllers/        ← REPLACE all 3 files
    utils/
      formatters.js     ← REPLACE
    server.js           ← REPLACE
    middleware/         ← NO CHANGE
    routes/             ← NO CHANGE
```

---

## Step 2 — Edit .env if your database password is different

Open `.env` and check `DATABASE_URL`:

```
DATABASE_URL="postgresql://myactivity:And@Gumbi@192.168.1.228:5432/rts_db?schema=public"
```

The format is: `postgresql://USER:PASSWORD@HOST:PORT/DB_NAME?schema=public`

---

## Step 3 — Run setup commands (ONE TIME ONLY)

Open a terminal in the `rts-fixed-backend` folder:

```bash
npm install
npm run db:setup
```

`db:setup` does three things automatically:
1. `npx prisma generate` — compiles the Prisma Client
2. `npx prisma db push`  — creates/updates tables in your PostgreSQL database
3. `node src/db/seed.js` — seeds all 339 users

You will see 339 users listed as they are created.

---

## Step 4 — Start the backend

```bash
npm run dev
```

You should see:
```
✅  Database connected via Prisma
🚀  RTS Backend running on http://localhost:5000
```

---

## If db:setup fails

Common causes:
- Wrong `DATABASE_URL` — check host, user, password, db name
- PostgreSQL not running — start your PostgreSQL service
- Database `rts_db` does not exist — create it first:
  ```sql
  CREATE DATABASE rts_db;
  ```

---

## Available npm scripts

| Command | What it does |
|---------|------|
| `npm run dev` | Start with nodemon (auto-restart on changes) |
| `npm run start` | Start normally |
| `npm run db:setup` | Generate + push + seed (run once) |
| `npm run db:push` | Push schema changes to DB |
| `npm run db:seed` | Re-seed users (safe to run multiple times) |

---

## Login credentials

| Role | Email | Password |
|------|-------|----------|
| Employee | santhosh.sm9@gmail.com | Santhosh@123 |
| RM | kadakkath@gmail.com | Anil@123 |
| HOD | bhatraveendrabeegar@gmail.com | Raveendra@123 |
| DeptHOD | software@rts.com | Software@123 |
| DeptHOD | academic@rts.com | Academic@123 |
| DeptHOD | operation@rts.com | Operation@123 |
| Admin | admin@rts.com | Admin@123 |

**Password rule for employees/RMs/HODs:** `FirstName@123`
**Password rule for DeptHODs:** `Dept@123` (e.g. `software@rts.com` → `Software@123`)
