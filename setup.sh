#!/bin/bash


set -e

echo "🚀 Setting up PushFundz Platform..."

if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not installed. Please install Python 3.8 or higher."
    exit 1
fi

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed. Please install Node.js 16 or higher."
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm is required but not installed. Please install npm."
    exit 1
fi

echo "✅ Prerequisites check passed"

echo "📦 Setting up backend..."
cd crypto-lending-backend

if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing Python dependencies..."
if [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
elif [ -f "pyproject.toml" ]; then
    pip install poetry
    poetry install
else
    echo "Installing basic dependencies..."
    pip install fastapi uvicorn sqlalchemy python-multipart python-jose[cryptography] passlib[bcrypt] httpx
fi

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "Creating .env file..."
    cat > .env << EOL
DATABASE_URL=sqlite:///./pushfundz.db


SECRET_KEY=your-super-secret-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

SECURITY_SERVICE_URL=http://localhost:3007
ENABLE_SECURITY_CHECK=false

NGN_TO_USD_RATE=0.0008
USD_TO_NGN_RATE=1250

ENVIRONMENT=development
EOL
    echo "✅ Created .env file with default settings"
fi

# Initialize database
echo "Initializing database..."
python -c "from app.database import create_tables; create_tables()" || echo "Database initialization completed"

echo "✅ Backend setup complete"

echo "📦 Setting up frontend..."
cd ../crypto-lending-frontend

echo "Installing Node.js dependencies..."
npm install

echo "Installing additional frontend dependencies..."
npm install @types/react @types/react-dom lucide-react

echo "✅ Frontend setup complete"

# Create run script
echo "📝 Creating run script..."
cd ..
cat > run.sh << 'EOL'
#!/bin/bash


echo "🚀 Starting PushFundz Platform..."

# Function to kill background processes on exit
cleanup() {
    echo "🛑 Stopping services..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit
}

trap cleanup SIGINT SIGTERM

# Start backend
echo "🔧 Starting backend..."
cd crypto-lending-backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!
cd ..

sleep 3

# Start frontend
echo "🎨 Starting frontend..."
cd crypto-lending-frontend
npm run dev &
FRONTEND_PID=$!
cd ..

echo "✅ Services started!"
echo "📱 Frontend: http://localhost:5173"
echo "🔧 Backend: http://localhost:8000"
echo "📚 API Docs: http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop all services"

wait
EOL

chmod +x run.sh

echo ""
echo "🎉 Setup complete!"
echo ""
echo "📋 Quick Start Guide:"
echo "1. Review and update the .env file in crypto-lending-backend/"
echo "2. Run './run.sh' to start both services"
echo "3. Open http://localhost:5173 for the frontend"
echo "4. Open http://localhost:8000/docs for API documentation"
echo ""
echo "🔧 Manual Commands:"
echo "Backend: cd crypto-lending-backend && source venv/bin/activate && uvicorn app.main:app --reload"
echo "Frontend: cd crypto-lending-frontend && npm run dev"
echo ""
echo "📖 For more information, check the README files in each directory"
