# 🔧 Railway Deployment Troubleshooting Guide

## Issue: "Only letting me set up the entire repo"

This is a common Railway monorepo issue. Here are multiple solutions:

## Solution 1: Railway CLI (Recommended)

### Install Railway CLI
```bash
npm install -g @railway/cli
```

### Deploy Backend
```bash
cd crypto-lending-backend
railway login
railway new
# Select "Empty Project"
# Name: "PushFundz Backend"
railway up
```

### Deploy Frontend
```bash
cd ../crypto-lending-frontend
railway new
# Name: "PushFundz Frontend"
railway up
```

### Add Database
```bash
# In backend directory
railway add postgresql
```

## Solution 2: Alternative UI Flow

### Method A: Service Settings After Creation
1. Create project with entire repo
2. Go to service → Settings → Source
3. Look for "Root Directory" or "Build Path"
4. Set to `crypto-lending-backend` or `crypto-lending-frontend`

### Method B: Advanced Configuration
1. Create empty project
2. Add service → GitHub repo
3. Click "Configure" or "Advanced" before deploying
4. Set build/source directory

## Solution 3: Alternative Hosting Platforms

If Railway continues to have issues:

### Render.com
- Better monorepo support
- Free tier available
- Easy PostgreSQL integration

### Vercel + Railway
- Frontend on Vercel (excellent React support)
- Backend on Railway or Render
- Database on Railway

### Heroku
- Classic platform with good monorepo support
- More expensive but reliable

## Solution 4: Separate Repositories

Create separate GitHub repos:
1. `pushfundz-backend` (copy crypto-lending-backend/)
2. `pushfundz-frontend` (copy crypto-lending-frontend/)
3. Deploy each separately on Railway

## Environment Variables Reference

### Backend (.env)
```
DATABASE_URL=postgresql://user:pass@host:port/db
SECRET_KEY=your-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=30
ALGORITHM=HS256
```

### Frontend (.env)
```
VITE_API_URL=https://your-backend-url.railway.app
```

## Verification Steps

1. **Backend Health Check**: Visit `https://your-backend.railway.app/health`
2. **Frontend Loading**: Visit your frontend URL
3. **Database Connection**: Check Railway logs for connection success
4. **API Integration**: Test frontend → backend communication

## Common Railway UI Issues

- **No Root Directory Field**: Try refreshing page or different browser
- **Build Detection Failed**: Manually specify build command
- **Service Creation Loops**: Clear browser cache and retry

## Support Resources

- Railway Discord: https://discord.gg/railway
- Railway Docs: https://docs.railway.app
- GitHub Issues: https://github.com/railwayapp/railway/issues

## Quick Commands

Generate secret key:
```bash
openssl rand -hex 32
```

Test local deployment:
```bash
# Backend
cd crypto-lending-backend
poetry install
poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000

# Frontend  
cd crypto-lending-frontend
npm install
npm run build
npm run preview
```

## Next Steps

1. Try Railway CLI first (most reliable)
2. If CLI fails, try alternative hosting
3. If all else fails, create separate repos

The comprehensive admin dashboard and gaming system is ready for deployment - we just need to get past this Railway configuration issue.
