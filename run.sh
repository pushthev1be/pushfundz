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
