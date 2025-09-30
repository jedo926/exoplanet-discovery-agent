# 🚀 Quick Setup Guide - Exoplanet Discovery Agent

## What This Does

When you start the server, it will **automatically**:

1. ✅ Scan NASA databases (TESS, Kepler, K2, Confirmed Planets)
2. ✅ Filter for **TRANSIT METHOD** planets only
3. ✅ Classify each planet using ChatGPT AI
4. ✅ Store discovered planets in Supabase database
5. ✅ Display them in real-time on the web interface

## Setup Steps

### 1. Create Supabase Database Table

Go to your Supabase project SQL Editor and run:

```sql
CREATE TABLE exoplanets (
  id BIGSERIAL PRIMARY KEY,
  planet_name TEXT UNIQUE NOT NULL,
  host_star TEXT,
  period NUMERIC,
  radius NUMERIC,
  depth NUMERIC,
  classification TEXT,
  probability NUMERIC,
  discovery_date TIMESTAMP,
  dataset TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 2. Install Dependencies

```bash
cd exoplanet_discovery_agent_js
npm install
```

### 3. Start the Server

```bash
npm start
```

## What Happens Next

### Automatic Startup Process:

```
🚀 Server starts on http://localhost:3000
🌠 Automatic NASA scan begins
📡 Scanning TESS for transit planets...
📡 Scanning KEPLER for transit planets...
📡 Scanning K2 for transit planets...
📡 Scanning CONFIRMED for transit planets...
✨ Startup scan completed! X new transit planets added to database
```

### Features:

- **Auto-Refresh**: Frontend refreshes every 10 seconds to show new discoveries
- **Live Notifications**: Toast notifications when new planets are found
- **Transit Method Filter**: Only planets discovered via transit method
- **AI Classification**: Each planet classified as Confirmed/Candidate/False Positive
- **Real-time Database**: All planets saved to Supabase automatically

## Web Interface

Open `http://localhost:3000` to see:

1. **Analysis Section**: Upload light curve CSV files
2. **Discovery Actions**: Manually trigger new scans
3. **Planets Database**: View all discovered planets with filters
   - Filter by classification (Confirmed/Candidate/False Positive)
   - Filter by dataset (TESS/Kepler/K2/Confirmed)
   - Auto-refreshes every 10 seconds

## Configuration

Your settings are already configured in `backend/agent.js`:
- ✅ OpenAI API Key (ChatGPT)
- ✅ Supabase URL
- ✅ Supabase Key

## NASA Data Sources

The system queries:
- **TESS**: Transit candidates and confirmed planets
- **Kepler**: KOI candidates and confirmed planets
- **K2**: K2 mission candidates
- **Confirmed**: All confirmed transit method planets from NASA archive

## How It Works

### Transit Method Detection:
```javascript
// Filters for planets with transit-related dispositions
const transitPlanets = nasaData.filter(entry => {
  const method = entry.discoverymethod || entry.koi_pdisposition || entry.toi_disposition;
  return method.includes('transit') ||
         method.includes('candidate') ||
         method.includes('confirmed');
});
```

### AI Classification:
```javascript
// ChatGPT evaluates each planet based on:
- Signal-to-Noise Ratio (SNR)
- Orbital Period
- Planetary Radius
- Transit Depth
- Physical plausibility
```

### Auto-Save to Database:
```javascript
// Planets meeting criteria are automatically saved
if (classification !== 'False Positive' && probability > 0.5) {
  await storePlanet(planetData);
}
```

## Expected Results

On first run, you should see:
- **100-500+ planets** discovered from NASA databases
- **Real-time updates** in the web interface
- **Detailed information** for each planet:
  - Planet name (TIC-XXX, TOI-XXX, KOI-XXX)
  - Host star
  - Orbital period
  - Planetary radius
  - Transit depth
  - AI classification and confidence
  - Discovery date
  - Source dataset

## Troubleshooting

### "No planets found"
- Check Supabase connection
- Verify SQL table was created
- Check console for NASA API errors

### "Auto-scan failed"
- NASA APIs may be temporarily unavailable
- Try manual scan using "Detect New Planets" button
- Check internet connection

### "AI classification errors"
- System will fall back to rule-based classification
- Verify OpenAI API key has credits
- Check API key is valid

## Manual Operations

After startup, you can also:

```bash
# Run full training manually
npm run train

# Quick update (check for new planets)
node backend/train.js quick

# Refresh specific dataset
node backend/train.js refresh tess
```

## Success Indicators

You'll know it's working when you see:
- ✅ Console shows "X new transit planets discovered"
- ✅ Web interface displays planet list
- ✅ Auto-refresh notifications appear
- ✅ Supabase table contains planet records

---

**Happy Planet Hunting! 🌌**
