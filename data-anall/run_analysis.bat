@echo off
:: Ensure we switch to the directory where this script is located
cd /d "%~dp0"

:: Check if backend folder exists
if not exist "backend" (
    echo Error: 'backend' directory not found.
    pause
    exit /b
)

cd backend

echo Starting Analysis Server...
echo Access the app at http://localhost:8000/
uvicorn main:app --reload --port 8000
pause
