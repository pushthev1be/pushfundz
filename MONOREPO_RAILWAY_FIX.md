# 🔧 Railway Monorepo Deployment Fix

## Problem
Railway Nixpacks build failed with error: "Nixpacks was unable to generate a build plan for this app."

This happens because Railway tried to build the entire monorepo at once instead of individual services.

## Solution: Create Separate Services with Root Directories

### Step 1: Delete Failed Deployment
1. Go to Railway dashboard
2. Delete the project that failed to build

### Step 2: Create New Project Structure
1. Click "New Project" → "Empty Project"
2. Name it "PushFundz"

### Step 3: Add Backend Service
1. Click "Add Service" → "GitHub Repo"
2. Select `pushfundz` repository
3. **IMPORTANT**: Set "Root Directory" to: `crypto-lending-backend`
4. Railway will detect FastAPI/Poetry

### Step 4: Add Frontend Service  
1. Click "Add Service" → "GitHub Repo"
2. Select `pushfundz` repository again
3. **IMPORTANT**: Set "Root Directory" to: `crypto-lending-frontend`
4. Railway will detect React/Vite

### Step 5: Add Database
1. Click "Add Service" → "Database" → "PostgreSQL"

### Step 6: Configure Environment Variables

**Backend Service:**
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
SECRET_KEY=your-secret-key-here
ACCESS_TOKEN_EXPIRE_MINUTES=30
ALGORITHM=HS256
```

**Frontend Service:**
```
VITE_API_URL=${{Backend.RAILWAY_STATIC_URL}}
```

### Step 7: Run Database Migrations
1. Go to Backend service → Console
2. Run: `python recreate_tables.py`
3. Run: `python create_admin.py`

## Why This Works
- Each service builds only its specific folder
- Nixpacks can properly detect the tech stack
- Services can reference each other via Railway variables

## Verification
- Backend should show "FastAPI" as detected framework
- Frontend should show "Node.js" as detected framework
- Both services should build successfully
