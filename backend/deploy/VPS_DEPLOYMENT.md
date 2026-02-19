# VPS Deployment (Backend + PostgreSQL + Redis)

## 1. Server prerequisites

- Ubuntu 22.04/24.04 VPS
- Docker + Docker Compose plugin installed
- Domain pointed to VPS (for API URL)

## 2. Upload project

```bash
git clone <your-repo-url>
cd blackjack-game-ui/backend
```

## 3. Create production env file

```bash
cp .env.vps.example .env.vps
```

Edit `.env.vps`:
- set strong `SECRET_KEY`
- set strong PostgreSQL password
- set `CORS_ORIGINS` to your frontend domain
- keep `DATABASE_URL=postgresql+psycopg://...@postgres:5432/maca`

## 4. Start stack

```bash
docker compose -f docker-compose.vps.yml up -d --build
```

Check:

```bash
docker compose -f docker-compose.vps.yml ps
docker compose -f docker-compose.vps.yml logs -f api
curl http://127.0.0.1:8000/api/v1/health
```

## 5. Reverse proxy with Nginx

Copy `deploy/nginx-maca.conf` to `/etc/nginx/sites-available/maca` and update `server_name`.

Enable:

```bash
sudo ln -s /etc/nginx/sites-available/maca /etc/nginx/sites-enabled/maca
sudo nginx -t
sudo systemctl reload nginx
```

## 6. HTTPS (Let's Encrypt)

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-api-domain.com
```

## 7. Update deployment

```bash
git pull
docker compose -f docker-compose.vps.yml up -d --build
```

## 8. Backups (minimum)

- PostgreSQL backup:

```bash
docker exec maca-postgres pg_dump -U maca maca > maca_backup_$(date +%F).sql
```

- Save backups off-server (S3/remote storage).

## 9. Security notes

- Do not expose DB/Redis publicly. Current compose binds them to `127.0.0.1`.
- Keep `.env.vps` private.
- Rotate `SECRET_KEY` and DB password per release cycle.
