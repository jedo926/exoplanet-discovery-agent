# 🌌 Exoplanet Discovery Agent

**NASA Space Apps Challenge 2024 - Exoplanet Detection Using Machine Learning**

An ML-powered full-stack application that discovers NEW exoplanets by analyzing light curve data from space telescopes. This project trains a Random Forest classifier on NASA's open-source exoplanet datasets (Kepler, K2, TESS) and provides a web interface for users to upload their own light curve data to discover previously unidentified exoplanets.

## Challenge Overview

This project addresses the NASA Space Apps Challenge: **"Leveraging AI/ML for Automated Exoplanet Detection"**

While thousands of exoplanets have been discovered through missions like Kepler, K2, and TESS, most were identified manually by astrophysicists. This project automates that process by:

1. **Training** an ML model on NASA's labeled exoplanet data (confirmed planets, candidates, and false positives)
2. **Analyzing** new light curve data to automatically classify transit signals
3. **Providing** a user-friendly web interface for researchers and enthusiasts to discover new planets

## Key Features

### For the NASA Challenge

✅ **Trained on NASA's Open Data**: Uses Kepler, K2, and TESS mission datasets
✅ **Web Interface**: User-friendly platform for uploading and analyzing data
✅ **Automated Classification**: ML model eliminates manual analysis
✅ **Model Statistics Display**: Shows accuracy, confidence, and feature importances
✅ **Real Discovery Potential**: Analyzes new data to find previously unknown exoplanets

### Technical Features

- 🔬 **Upload Light Curves**: Analyze CSV files containing time-series flux data
- 🤖 **ML Classification**: Random Forest model (~79% accuracy) trained on NASA-labeled planets
- 📊 **Feature Extraction**: Automatically extracts orbital period, radius, transit depth, and SNR
- 📈 **Phase-Folded Plots**: Visualize transit signatures with interactive Plotly charts
- 💾 **Database Integration**: Store discovered planets in Supabase with confidence scores
- 🌐 **Modern Web UI**: Responsive interface with real-time analysis results
- 🎯 **True Discovery**: Find planets that may not be in NASA's databases yet
- ⚡ **Fast Analysis**: Instant classification with fallback to rule-based systems
- 🔄 **Retrainable**: Easily update the model with fresh NASA data

## Project Structure

```
exoplanet_discovery_agent_js/
├── backend/
│   └── agent.js          # ML classification, feature extraction, Supabase integration
├── frontend/
│   ├── index.html        # Web UI structure
│   ├── app.js            # Frontend JavaScript logic
│   └── styles.css        # CSS styling
├── ml_model/
│   ├── fetch_nasa_data.py # Fetch training data from NASA Exoplanet Archive
│   ├── train_model.py     # Train the Random Forest classifier
│   ├── predict_api.py     # Flask API for ML predictions
│   ├── test_model.py      # Test the trained model
│   └── requirements.txt   # Python dependencies
├── server.js             # Express.js API server
├── package.json          # Dependencies
└── README.md            # This file
```


### Analyze Light Curves

1. Open `http://localhost:3000` in your browser
2. Click "Choose File" and upload a CSV file with light curve data
3. (Optional) Enter a planet ID like "TIC-12345"
4. Click "🔍 Analyze Light Curve"

**What happens during analysis:**
1. 📁 CSV file is parsed for time and flux columns
2. 📊 Features are extracted (period, radius, depth, SNR)
3. 🤖 ML model classifies the transit signal
4. 📈 Phase-folded light curve plot is generated
5. 💾 If Confirmed or Candidate (>50% confidence), planet is stored in database
6. ✨ Results are displayed with classification and confidence score

## Feature Extraction

The system extracts the following features from light curves:

- **Orbital Period**: Estimated from time span
- **Transit Duration**: Time spent in transit
- **Planetary Radius**: Calculated from transit depth
- **Transit Depth**: Flux decrease in ppm
- **Signal-to-Noise Ratio (SNR)**: Transit signal strength
- **Odd-Even Depth Difference**: Transit consistency metric

## How It Works

### 1. Data Collection (`fetch_nasa_data.py`)
- Queries NASA Exoplanet Archive TAP service
- Downloads labeled data from Kepler, K2, and TESS missions
- Includes confirmed planets, candidates, and false positives
- Caches data locally in `../cache/` directory

### 2. Model Training (`train_model.py`)
- **Algorithm**: Random Forest Classifier (ensemble of 200 decision trees)
- **Features Used**:
  - Orbital Period (days)
  - Planetary Radius (Earth radii)
  - Transit Depth (parts per million)
  - Signal-to-Noise Ratio (SNR)
  - Transit Duration (hours)
  - Dataset Source (Kepler/K2/TESS)
- **Classes**: Confirmed Planet, Candidate Planet, False Positive
- **Performance**: ~79% accuracy on test data
- **Output**: Saves model, scaler, and statistics to `.pkl` files

### 3. Classification (`predict_api.py`)
- Flask API exposes `/predict` endpoint
- Accepts exoplanet features as JSON
- Returns classification with confidence score
- Handles batch predictions for efficiency

### 4. User Workflow
1. User uploads CSV light curve (time vs. flux data)
2. Backend extracts features from transit signals
3. ML model classifies the exoplanet candidate
4. Results displayed with phase-folded visualization
5. Confirmed/Candidate planets stored in database

**Fallback Classification** (if ML API unavailable):
- SNR > 10 + physical plausibility → Confirmed Planet
- SNR > 5 + reasonable parameters → Candidate Planet
- SNR < 5 or non-physical parameters → False Positive

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

## Data Sources

### Training Data
The ML model is trained on data from the [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/):
- **Kepler Objects of Interest (KOI)**: Confirmed and candidate planets
- **K2 Planets and Candidates**: K2 mission discoveries
- **TESS Objects of Interest (TOI)**: TESS mission candidates

### Light Curve Sources
You can upload light curves from:
- **TESS**: Transiting Exoplanet Survey Satellite
- **Kepler**: Kepler Space Telescope
- **K2**: K2 Extended Mission
- **Ground-based**: Amateur and professional ground telescopes
- **Simulated Data**: For testing and validation

## Troubleshooting

### "Failed to load planets"
- Check Supabase credentials in `.env` file
- Verify the `exoplanets` table exists in Supabase
- Check browser console for errors

### "ML model not available"
- Ensure Flask API is running on port 5001
- Check that ML model files exist (`exoplanet_classifier.pkl`, `feature_scaler.pkl`)
- Run `python3 train_model.py` to generate model files
- System will fall back to rule-based classification

### "No valid data in CSV file"
- Ensure CSV has `time` and `flux` columns (or TIME/FLUX/bjd/sap_flux)
- Check for proper CSV formatting (comma-separated values)
- Remove any header rows that aren't column names
- Ensure values are numeric

### "Analysis gives False Positive"
- Check that your light curve has clear transit signals
- Ensure SNR is high enough (>5 for candidates, >10 for confirmed)
- Verify transit depth is measurable
- Check that orbital period is reasonable (0.5-500 days)

## Technologies Used

- **Backend**: Node.js, Express.js
- **ML Model**: Python, scikit-learn (Random Forest), Flask
- **Database**: Supabase (PostgreSQL)
- **Frontend**: HTML5, CSS3, JavaScript
- **Visualization**: Plotly.js
- **Data Processing**: PapaParse, Axios, NumPy, Pandas

## Contributing

This project was created for the NASA Hackathon.

## Challenge Requirements Checklist

This project addresses all NASA Space Apps Challenge objectives:

- ✅ **Trained on NASA Open Data**: Uses Kepler, K2, and TESS datasets from NASA Exoplanet Archive
- ✅ **Automated ML Classification**: Random Forest model with 79% accuracy
- ✅ **Web Interface**: Full-stack application for user interaction
- ✅ **Upload New Data**: Users can upload CSV light curves for analysis
- ✅ **Model Statistics**: Displays accuracy, confidence scores, and feature importances
- ✅ **Database Storage**: Tracks all discovered planets with metadata
- ✅ **Open Source**: Uses Python, scikit-learn, Node.js, and open-source tools
- ✅ **Extensible**: Model can be retrained with new NASA data
- ✅ **User-Friendly**: Designed for both researchers and astronomy enthusiasts

## Why This Approach Works

### Transit Method Detection
The transit method detects planets by measuring the dip in starlight when a planet passes in front of its host star. Our model learns to:
1. Distinguish real planetary transits from noise and stellar activity
2. Identify physically plausible orbital characteristics
3. Assess signal quality to determine confidence levels

### Machine Learning Advantages
- **Speed**: Analyzes light curves in seconds vs. hours of manual review
- **Consistency**: Applies the same criteria to every data point
- **Scalability**: Can process thousands of light curves automatically
- **Discovery**: May identify planets missed by manual analysis

### Real-World Impact
By automating exoplanet classification, this tool enables:
- Faster analysis of TESS and future mission data
- Citizen scientists to contribute to exoplanet discovery
- Researchers to focus on follow-up observations
- Potential discovery of overlooked exoplanet candidates

## Acknowledgments

- NASA Exoplanet Archive for providing training data and light curve access
- scikit-learn for the Random Forest implementation
- Supabase for database infrastructure
- The open-source astronomy community
