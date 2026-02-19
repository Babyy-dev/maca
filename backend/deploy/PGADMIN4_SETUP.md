# pgAdmin4 Setup (From Your PC)

This guide connects your PC pgAdmin4 to PostgreSQL on the VPS safely.

## Recommended: SSH tunnel (safe)

### 1. Create SSH tunnel from your PC

Windows PowerShell:

```powershell
ssh -L 5433:127.0.0.1:5432 your-vps-user@your-vps-ip
```

Keep this terminal open.

### 2. Add server in pgAdmin4

- Name: `maca-vps`
- Host: `127.0.0.1`
- Port: `5433`
- Maintenance DB: `postgres`
- Username: `maca`
- Password: your PostgreSQL password

Then connect.

## Alternative: local PostgreSQL on your PC

If you want local PostgreSQL for dev with pgAdmin4:

1. Create role + DB using query tool:
   - open `deploy/sql/01_create_maca_db.sql`
   - run as postgres superuser (adjust password before running)
2. Set backend `.env`:

```env
DATABASE_URL=postgresql+psycopg://maca:change-this-postgres-password@127.0.0.1:5432/maca
```

3. Run backend:

```bash
uvicorn app.main:app --reload --port 8000
```

## Quick checks in pgAdmin

Run:

```sql
SELECT current_database(), current_user;
SELECT COUNT(*) FROM users;
SELECT COUNT(*) FROM round_logs;
```

If tables are missing, start backend once and it will create schema at startup.
