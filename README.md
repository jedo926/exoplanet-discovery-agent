# 🌌 Exoplanet Discovery Agent (Node.js)

An AI-powered full-stack application that automatically detects exoplanets using NASA datasets (Kepler, K2, TESS), stores discovered planets in Supabase, and provides an interactive web interface for analysis.

## Features

- 🚀 **Automatic Startup Scan**: Automatically scans NASA databases for transit method planets when server starts
- 🤖 **AI-Powered Classification**: Uses ChatGPT API to classify exoplanets as Confirmed, Candidate, or False Positive
- 📊 **Light Curve Analysis**: Upload CSV files and analyze transit data with feature extraction
- 🔍 **Transit Method Filter**: Specifically targets planets discovered via the transit method
- 💾 **Database Integration**: Store and query discovered exoplanets in Supabase
- 📈 **Interactive Visualizations**: Phase-folded transit curves using Plotly.js
- 🌐 **Modern Web UI**: Responsive interface with auto-refresh and live notifications
- ⚡ **Real-time Updates**: Frontend refreshes every 10 seconds to display new discoveries

## Project Structure

```
exoplanet_discovery_agent_js/
├── backend/
│   ├── agent.js          # AI logic, feature extraction, Supabase integration
│   └── train.js          # Data refresh and automatic planet detection
├── frontend/
│   ├── index.html        # Web UI structure
│   ├── app.js            # Frontend JavaScript logic
│   └── styles.css        # CSS styling
├── server.js             # Express.js API server
├── package.json          # Dependencies
└── README.md            # This file
```

## Prerequisites

- Node.js (v14 or higher)
- npm
- Supabase account (free tier works)
- OpenAI API key (ChatGPT)

## Installation

1. **Clone or navigate to the project directory**:
   ```bash
   cd exoplanet_discovery_agent_js
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up Supabase**:
   - Create a free account at [supabase.com](https://supabase.com)
   - Create a new project
   - In the SQL Editor, create the exoplanets table:

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

4. **Configure environment variables**:

   Update the credentials in `backend/agent.js` (lines 9-11):
   ```javascript
   const OPENAI_API_KEY = 'your-openai-api-key';
   const SUPABASE_URL = 'your-supabase-url';
   const SUPABASE_KEY = 'your-supabase-anon-key';
   ```

   Or set environment variables:
   ```bash
   export SUPABASE_URL='your-supabase-url'
   export SUPABASE_KEY='your-supabase-anon-key'
   ```

## Usage

### Start the Server

```bash
npm start
```

The server will start on `http://localhost:3000` and **automatically begin scanning NASA databases for transit method planets**.

**What happens on startup:**
1. 🔍 Scans TESS, Kepler, K2, and Confirmed Planets datasets
2. 🎯 Filters for transit method planets only
3. 🤖 Classifies each planet using ChatGPT AI
4. 💾 Stores discoveries in Supabase
5. 🌟 Displays results in real-time on the web interface

You'll see console output like:
```
🔍 AUTO-SCAN: Starting automatic transit planet detection...
📡 Scanning TESS for transit planets...
✓ Discovered 45 new transit planets from TESS
📡 Scanning KEPLER for transit planets...
✓ Discovered 23 new transit planets from KEPLER
...
🌟 AUTO-SCAN COMPLETE: 150 total transit planets discovered and stored
```

### Web Interface

Open your browser and navigate to `http://localhost:3000`

**Features:**
1. **Upload Light Curve**: Upload CSV files containing time and flux data
2. **AI Analysis**: Get instant classification with probability scores
3. **View Features**: See extracted orbital period, radius, SNR, transit depth
4. **Phase-Folded Plot**: Interactive visualization of the transit
5. **Detect New Planets**: Scan NASA datasets for undiscovered planets
6. **Database View**: Browse all discovered planets with filters

### Training / Data Refresh

**Full training** (refresh all datasets and detect new planets):
```bash
npm run train
# or
node backend/train.js full
```

**Quick update** (detect new planets without refresh):
```bash
node backend/train.js quick
```

**Refresh specific dataset**:
```bash
node backend/train.js refresh tess
```

## API Endpoints

### POST `/api/analyze`
Analyze uploaded CSV light curve file
- **Body**: FormData with `file` and optional `ticId`
- **Response**: Classification, probability, features, plot data

### GET `/api/planets`
Get all discovered planets from database
- **Response**: List of all planets with metadata

### POST `/api/detect-new`
Detect new planets from NASA datasets
- **Body**: `{ "dataset": "tess" }` (options: tess, kepler, k2)
- **Response**: List of newly discovered planets

### POST `/api/train`
Train/refresh the agent
- **Body**: `{ "mode": "quick" }` or `{ "mode": "full" }`
- **Response**: Training status

### GET `/api/datasets`
Get available NASA datasets
- **Response**: List of datasets with descriptions

## Feature Extraction

The system extracts the following features from light curves:

- **Orbital Period**: Estimated from time span
- **Transit Duration**: Time spent in transit
- **Planetary Radius**: Calculated from transit depth
- **Transit Depth**: Flux decrease in ppm
- **Signal-to-Noise Ratio (SNR)**: Transit signal strength
- **Odd-Even Depth Difference**: Transit consistency metric

## AI Classification

The ChatGPT API classifies planets based on:
- SNR > 10 → Confirmed Planet
- SNR > 5 → Candidate Planet
- SNR < 5 → False Positive
- Additional checks: period range, radius range, physical plausibility

## CSV Format

Light curve CSV files should contain columns:
- `time` or `TIME` or `bjd` (time in days)
- `flux` or `FLUX` or `sap_flux` (normalized flux)

Example:
```csv
time,flux
0.0,1.0000
0.01,0.9998
0.02,0.9985
...
```

## NASA Data Sources

- **TESS**: Transiting Exoplanet Survey Satellite
- **Kepler**: Kepler Space Telescope
- **K2**: K2 Mission

Data is fetched from the NASA Exoplanet Archive and cached locally.

## Troubleshooting

### "Failed to load planets"
- Check Supabase credentials
- Verify the `exoplanets` table exists
- Check browser console for errors

### "AI classification error"
- Verify OpenAI API key is valid
- Check API key has sufficient credits
- System will fall back to rule-based classification

### "No valid data in CSV file"
- Ensure CSV has `time` and `flux` columns
- Check for proper CSV formatting
- Remove any header rows that aren't column names

## Technologies Used

- **Backend**: Node.js, Express.js
- **AI**: OpenAI ChatGPT API
- **Database**: Supabase (PostgreSQL)
- **Frontend**: HTML5, CSS3, JavaScript
- **Visualization**: Plotly.js
- **Data Processing**: PapaParse, Axios

## Contributing

This project was created for the NASA Hackathon. Feel free to fork and improve!

## License

MIT

## Acknowledgments

- NASA Exoplanet Archive for providing public datasets
- OpenAI for the ChatGPT API
- Supabase for database infrastructure
