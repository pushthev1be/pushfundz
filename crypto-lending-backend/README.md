# PushFundz Crypto Lending Backend

FastAPI-based backend for the PushFundz crypto lending platform.

## Railway Deployment

This application is configured for Railway deployment using Nixpacks.

### Environment Variables

Set the following environment variables in Railway:

- `DATABASE_URL`: PostgreSQL connection string (Railway will provide this automatically)
- `PORT`: Application port (Railway sets this automatically)

### Database Setup

The application will automatically create tables on startup. For production, consider running migrations manually:

```bash
cd crypto-lending-backend
poetry run alembic upgrade head
```

### Local Development

```bash
poetry install
poetry run uvicorn app.main:app --reload --port 8000
```
