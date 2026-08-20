#!/bin/bash

# Start FastAPI backend
echo "Starting HomelabOS Backend..."
cd backend
source venv/bin/activate
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start Vite frontend
echo "Starting HomelabOS Frontend..."
cd ../frontend
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!

# Trap exit signals to terminate both servers
trap "echo 'Stopping servers...'; kill $BACKEND_PID $FRONTEND_PID" EXIT

wait
