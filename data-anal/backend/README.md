# AgriDoE - Scientific Experiment Designer & Analyzer

AgriDoE is a professional web application tailored for agricultural scientists and field researchers. It provides scientifically accurate tools for designing experiments, randomizing layouts, and performing statistical analysis (ANOVA).

## Features
- **Supported Designs**: CRD, RCBD, Factorial, Split-Plot, Latin Square.
- **Randomization Engine**: True statistical randomization with seed-based reproducibility stubs.
- **Field Layout**: Visual grid-based layout for field mapping.
- **Data Analysis**: Integrated ANOVA engine with Mean Separation (Tukey HSD).
- **Visualization**: Publication-quality bar plots with error bars (±SD).

## Setup & Usage

### 1. Backend Server
The backend is built with FastAPI and requires Python 3.12+.
The server is already running on `http://localhost:8000`.
To manualy start:
```powershell
.\venv\Scripts\python.exe -m uvicorn backend.main:app --port 8000
```

### 2. Frontend
No installation required (CDN-based React). 
Simply open `frontend/index.html` in any modern web browser.

## Project Structure
- `backend/`: Python FastAPI application.
  - `main.py`: API Entry point.
  - `stats_engines.py`: Statistical logic and randomization.
  - `models.py`: Data validation.
- `frontend/`: 
  - `index.html`: Main dashboard.
  - `index.css`: Styles.
- `venv/`: Python virtual environment.
