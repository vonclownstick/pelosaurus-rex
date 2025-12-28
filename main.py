import os
import json
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

app = FastAPI(title="Peloton Workout Assistant")

# Mount static files directory
app.mount("/static", StaticFiles(directory="static"), name="static")

# Setup templates
templates = Jinja2Templates(directory="templates")

# Get PIN from environment variable (default "1234" for development)
APP_PIN = os.getenv("APP_PIN", "1234")


class AuthRequest(BaseModel):
    pin: str


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    """Serve the main application page"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/routines")
async def get_routines():
    """Return all workout routines from routines.json"""
    try:
        with open("routines.json", "r") as f:
            routines = json.load(f)
        return routines
    except FileNotFoundError:
        raise HTTPException(status_code=500, detail="Routines file not found")
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Invalid routines file format")


@app.post("/api/auth")
async def authenticate(auth: AuthRequest):
    """Authenticate user with PIN"""
    if auth.pin == APP_PIN:
        return {"status": "success", "message": "Authentication successful"}
    else:
        raise HTTPException(status_code=401, detail="Invalid PIN")


@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {"status": "healthy"}
