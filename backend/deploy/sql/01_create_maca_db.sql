-- Run as postgres superuser.
-- If role/database already exist, skip corresponding statement manually.

CREATE ROLE maca WITH LOGIN PASSWORD 'change-this-postgres-password';
CREATE DATABASE maca OWNER maca;
GRANT ALL PRIVILEGES ON DATABASE maca TO maca;
