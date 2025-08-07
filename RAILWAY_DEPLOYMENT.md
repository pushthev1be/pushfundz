# 🚀 Railway Deployment Guide for PushFundz

## Prerequisites
- GitHub account with pushfundz repository
- Railway account (sign up at railway.app)

## Step 1: Connect GitHub to Railway

1. Go to [railway.app](https://railway.app) and sign in with GitHub
2. Click "New Project" → "Deploy from GitHub repo"
3. Select your `pushfundz` repository
4. Railway will detect the monorepo structure

## Step 2: Deploy Backend Service

1. **Create Backend Service:**
   - Click "Add Service" → "GitHub Repo"
   - Select the `crypto-lending-backend` folder
   - Railway will auto-detect Python/Poetry

2. **Add PostgreSQL Database:**
   - Click "Add Service" → "Database" → "PostgreSQL"
   - Railway will automatically create connection string

3. **Set Environment Variables:**
   ```bash
   # Backend service environment variables
   DATABASE_URL=${{Postgres.DATABASE_URL}}  # Auto-provided by Railway
   SECRET_KEY=your-super-secret-jwt-key-here  # Generate with: openssl rand -hex 32
   ACCESS_TOKEN_EXPIRE_MINUTES=30
   ALGORITHM=HS256
   PORT=8000
   ```

4. **Generate Secret Key:**
   ```bash
   # Run this locally to generate a secure secret key
   openssl rand -hex 32
   # Copy the output to SECRET_KEY environment variable
   ```

## Step 3: Deploy Frontend Service

1. **Create Frontend Service:**
   - Click "Add Service" → "GitHub Repo"
   - Select the `crypto-lending-frontend` folder
   - Railway will auto-detect Node.js/React

2. **Set Environment Variables:**
   ```bash
   # Frontend service environment variables
   VITE_API_URL=${{Backend.RAILWAY_STATIC_URL}}  # Points to your backend service
   PORT=3000
   ```

## Step 4: Database Setup

1. **Access Railway Console:**
   - Go to your backend service
   - Click "Console" tab
   - Run migration commands:

   ```bash
   # Install dependencies first
   poetry install

   # Create all database tables
   python recreate_tables.py

   # Create first admin user
   python create_admin.py
   ```

2. **Verify Database:**
   - Check that all tables are created
   - Confirm admin user exists

## Step 5: Configure Custom Domains (Optional)

1. **Backend Domain:**
   - Go to backend service → Settings → Domains
   - Add custom domain: `api.yoursite.com`

2. **Frontend Domain:**
   - Go to frontend service → Settings → Domains  
   - Add custom domain: `yoursite.com`

3. **Update Frontend Environment:**
   ```bash
   VITE_API_URL=https://api.yoursite.com
   ```

## Step 6: Security Configuration

1. **Enable CORS for Production:**
   - Update `main.py` CORS origins to your frontend domain
   - Remove wildcard "*" origins

2. **Rate Limiting:**
   - Consider adding rate limiting middleware
   - Especially important for gaming endpoints

3. **SSL/HTTPS:**
   - Railway provides automatic SSL certificates
   - Ensure all API calls use HTTPS

## Step 7: Monitoring & Logs

1. **View Logs:**
   - Each service has a "Logs" tab
   - Monitor for errors during deployment

2. **Metrics:**
   - Railway provides CPU/Memory usage metrics
   - Set up alerts for high usage

## Expected Costs

- **Backend Service:** ~$5-10/month
- **PostgreSQL Database:** ~$5/month  
- **Frontend Service:** ~$5/month
- **Total:** ~$15-20/month

## Troubleshooting

### Common Issues:

1. **Database Connection Errors:**
   - Verify DATABASE_URL is set correctly
   - Check PostgreSQL service is running

2. **Frontend API Errors:**
   - Ensure VITE_API_URL points to backend service
   - Check CORS configuration

3. **Build Failures:**
   - Check Poetry dependencies in backend
   - Verify Node.js version compatibility

4. **Migration Errors:**
   - Run `recreate_tables.py` manually via console
   - Check database permissions

### Support:
- Railway Discord: [discord.gg/railway](https://discord.gg/railway)
- Railway Docs: [docs.railway.app](https://docs.railway.app)

## Post-Deployment Checklist

- [ ] Backend service is running and accessible
- [ ] Frontend service is running and accessible  
- [ ] Database tables are created
- [ ] Admin user is created
- [ ] Gaming system works (test RP earning/spending)
- [ ] Admin dashboard is accessible
- [ ] All API endpoints respond correctly
- [ ] CORS is configured for production domains
- [ ] SSL certificates are active

Your PushFundz crypto lending platform is now live! 🎉
