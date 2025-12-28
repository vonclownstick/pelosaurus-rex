# Pelosaurus Rex 🦖

A mobile-first web application that acts as an automated cycling coach, guiding users through power zone interval workouts with large visual timers, workout timeline visualization, and Text-to-Speech audio cues.

## Features

- **PIN-based authentication** - Secure keypad login
- **5 Structured Rides** - Week Plan A (polarized training approach)
  - Ride 1: Z2 Steady (high cadence)
  - Ride 2: Z2 with Z3 Lifts
  - Ride 3: Z2 Steady (repeatable volume)
  - Ride 4: VO₂ Builder (only hard day)
  - Ride 5: Z2 Steady (recovery protection)
- **Prominent zone display** - Current zone (Z1-Z5) clearly visible during intervals
- **Standard warm-up protocol** - 11-minute progressive warm-up with priming set
- **Large timer display** - Readable from distance during workout
- **Visual timeline** - Color-coded segments showing workout structure
- **Text-to-Speech coaching** - Audio cues for zone changes, warnings, and countdowns
- **Wake lock support** - Prevents phone from sleeping during workout
- **Mobile-optimized** - Dark mode, large touch targets, responsive design

## Local Development

### Prerequisites

- Python 3.11+
- pip

### Setup

1. Install dependencies:
```bash
pip install -r requirements.txt
```

2. Run the development server:
```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

3. Open your browser to `http://localhost:8000`

4. Default PIN is `1234`

## Deployment to Render

### Step 1: Push to GitHub

1. Initialize git repository (if not already done):
```bash
git init
git add .
git commit -m "Initial commit - Peloton Workout Assistant"
```

2. Create a new repository on GitHub

3. Push your code:
```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

### Step 2: Deploy on Render

1. Go to [Render Dashboard](https://dashboard.render.com/)
2. Click **New +** → **Web Service**
3. Connect your GitHub repository
4. Configure the service:
   - **Name:** `pelosaurus-rex` (or your choice)
   - **Runtime:** `Python 3`
   - **Build Command:** `pip install -r requirements.txt`
   - **Start Command:** `uvicorn main:app --host 0.0.0.0 --port $PORT`

5. Add environment variable:
   - **Key:** `APP_PIN`
   - **Value:** Your custom PIN (e.g., `9999`)

6. Click **Create Web Service**

7. Wait for deployment to complete (2-3 minutes)

8. Access your app at the provided Render URL

## Customizing Workouts

Edit `routines.json` to add or modify workouts. Each ride follows the standard warm-up protocol:

```json
{
  "id": 6,
  "title": "Ride 6 — Custom Workout",
  "description": "Your custom workout (45 min)",
  "intensity": "yellow",
  "segments": [
    {
      "phase": "Z2 Steady",
      "duration": 1860,
      "color": "#8BC34A",
      "instruction": "Your custom instructions here"
    }
  ]
}
```

**Power Zone Colors:**
- Z1 (Recovery): `#4CAF50` (light green)
- Z2 (Endurance): `#8BC34A` (green)
- Z3 (Tempo): `#FFC107` (yellow)
- Z4 (Threshold): `#FF9800` (orange)
- Z5 (VO₂ max): `#F44336` (red)

After editing, commit and push to GitHub - Render will auto-deploy.

## Intensity Levels

- **Green:** Easy/Z2 workouts
- **Yellow:** Moderate/Z3 workouts
- **Red:** Hard/Z4-Z5 workouts

## Browser Compatibility

- **iOS Safari:** Fully supported (requires user interaction for TTS)
- **Chrome (Android):** Fully supported
- **Chrome (Desktop):** Fully supported
- **Firefox:** Supported (Wake Lock may not work)

## Project Structure

```
workout_app/
├── main.py              # FastAPI backend
├── requirements.txt     # Python dependencies
├── routines.json        # Workout data
├── static/
│   ├── script.js        # Frontend logic
│   └── style.css        # Styling
└── templates/
    └── index.html       # Single page application
```

## Troubleshooting

**Issue:** Can't hear audio cues on iOS
- **Solution:** Make sure to tap the "Start" button. iOS requires user interaction to enable audio.

**Issue:** Screen keeps turning off during workout
- **Solution:** Wake Lock is not supported in all browsers. Try Chrome or Safari on mobile.

**Issue:** Authentication fails
- **Solution:** Check that `APP_PIN` environment variable is set correctly in Render dashboard.

## License

MIT
