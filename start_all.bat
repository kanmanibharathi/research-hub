@echo off
start cmd /k "echo Starting Authentication Backend... && python3 backend/app.py"
start cmd /k "echo Starting Analysis Server... && cd data-anal/backend && python3 -m uvicorn main:app --reload --port 8000"
echo Both servers are starting in separate windows.
echo Auth API: http://localhost:5000/api
echo Analysis API/Frontend: http://localhost:8000/
pause
