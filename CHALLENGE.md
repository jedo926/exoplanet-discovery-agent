# NASA Space Apps Challenge 2024
## Exoplanet Detection Using Machine Learning

### Challenge Summary

**Challenge**: Create an AI/ML model trained on NASA's open-source exoplanet datasets that can analyze new data to accurately identify exoplanets, with a web interface for user interaction.

**Source Datasets**:
- Kepler Mission (cumulative table): https://exoplanetarchive.ipac.caltech.edu
- K2 Mission (k2pandc table): https://exoplanetarchive.ipac.caltech.edu
- TESS Mission (TOI table): https://exoplanetarchive.ipac.caltech.edu

---

## Our Solution

### Overview
We created a full-stack ML application that:
1. Trains a Random Forest classifier on NASA's labeled exoplanet data
2. Provides a web interface for uploading light curve data
3. Automatically classifies exoplanet candidates in real-time
4. Stores discoveries in a database for further analysis

### Technical Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   NASA Exoplanet Archive                │
│          (Kepler, K2, TESS labeled datasets)            │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              fetch_nasa_data.py                         │
│        Downloads training data via TAP API              │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              train_model.py                             │
│   Random Forest Classifier (200 trees, 79% accuracy)    │
│   Features: Period, Radius, Depth, SNR, Duration        │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              predict_api.py                             │
│         Flask REST API (port 5001)                      │
│    /predict - Classify exoplanet features               │
│    /stats   - Model performance metrics                 │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────┐
│              server.js + frontend                       │
│   Node.js/Express web server (port 3000)                │
│   - Upload light curve CSV files                        │
│   - Extract features automatically                      │
│   - Display classification results                      │
│   - Store discoveries in Supabase                       │
└─────────────────────────────────────────────────────────┘
```

---

## Challenge Requirements Addressed

### ✅ 1. Trained on NASA Open-Source Datasets

**Requirement**: Use one or more NASA open-source exoplanet datasets

**Our Implementation**:
- `fetch_nasa_data.py` downloads data from NASA Exoplanet Archive TAP service
- Combines data from three missions: Kepler, K2, and TESS
- Uses labeled classifications (Confirmed, Candidate, False Positive)
- Automatically handles different data formats from each mission

**Data Sources**:
```python
# Kepler: Cumulative KOI table
https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=SELECT+*+FROM+cumulative

# K2: Planets and Candidates
https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=SELECT+*+FROM+k2pandc

# TESS: Objects of Interest
https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=SELECT+*+FROM+toi
```

### ✅ 2. Machine Learning Model

**Requirement**: Analyze data to identify new exoplanets

**Our Implementation**:
- **Algorithm**: Random Forest Classifier (scikit-learn)
- **Ensemble**: 200 decision trees with max depth 20
- **Performance**: ~79% accuracy on held-out test data
- **Cross-validation**: 5-fold CV for robust evaluation

**Features Extracted**:
1. **Orbital Period** - Planet's year length
2. **Planetary Radius** - Size relative to Earth
3. **Transit Depth** - Brightness drop during transit
4. **Signal-to-Noise Ratio** - Signal quality metric
5. **Transit Duration** - Time planet blocks starlight
6. **Dataset Source** - Which mission detected it

**Classification Output**:
- Confirmed Planet (high confidence)
- Candidate Planet (moderate confidence)
- False Positive (low confidence)

### ✅ 3. Web Interface

**Requirement**: Facilitate user interaction

**Our Implementation**:

**Frontend Features**:
- Upload CSV light curve files
- Real-time analysis progress
- Interactive phase-folded plots (Plotly.js)
- Classification results with confidence scores
- Database of discovered planets with filtering

**Backend API**:
- `POST /api/analyze` - Analyze uploaded light curves
- `GET /api/planets` - View all discoveries
- `GET /api/ml-stats` - Model performance metrics

**User Experience**:
1. User uploads light curve CSV
2. System extracts features automatically
3. ML model classifies in <1 second
4. Results displayed with visualization
5. Confirmed/Candidates saved to database

### ✅ 4. Data Upload Capability

**Requirement**: Allow users to upload new data

**Our Implementation**:
- Drag-and-drop file upload
- Accepts CSV/TXT formats
- Automatic column detection (time, flux, TIME, FLUX, bjd, sap_flux)
- Optional planet ID field for naming
- Up to 10MB file size

**CSV Format Supported**:
```csv
time,flux
0.0,1.0000
0.01,0.9998
0.02,0.9985
...
```

### ✅ 5. Model Statistics Display

**Requirement**: Show accuracy and performance

**Our Implementation**:
- Real-time confidence scores for each prediction
- Model accuracy display (79.25% test accuracy)
- Feature importance rankings
- Classification probabilities for all classes
- `model_stats.json` with comprehensive metrics

**Statistics Available**:
```json
{
  "test_accuracy": 0.7925,
  "cv_mean": 0.7823,
  "n_samples": 265,
  "feature_importances": {
    "SNR": 0.342,
    "Period": 0.218,
    "Radius": 0.195,
    ...
  }
}
```

### ✅ 6. Open Source & Reproducible

**Technologies Used**:
- Python 3.8+ (scikit-learn, Flask, NumPy, Pandas)
- Node.js (Express.js, Supabase client)
- HTML5, CSS3, JavaScript (Plotly.js)

**Easy Setup**:
```bash
# 1. Fetch NASA data
python3 fetch_nasa_data.py

# 2. Train model
python3 train_model.py

# 3. Start API
python3 predict_api.py

# 4. Start web server
npm start
```

---

## Potential Considerations Implemented

### ✅ Aimed at Multiple Audiences
- **Researchers**: Upload raw light curves for automated analysis
- **Students**: Learn about exoplanet detection methods
- **Enthusiasts**: Explore discovered planets in database

### ✅ Model Retraining
- `fetch_nasa_data.py` re-downloads latest NASA data
- `train_model.py` retrains with new data
- Easy to incorporate user-submitted data in future versions

### ✅ Statistics & Transparency
- Display model accuracy on every page
- Show confidence scores for predictions
- Feature importance reveals what drives decisions
- Classification probabilities for all classes

### ⚠️ Hyperparameter Tweaking (Future Enhancement)
- Currently: Fixed hyperparameters (n_estimators=200, max_depth=20)
- Future: Web UI for adjusting hyperparameters
- Could add: Grid search for optimal parameters

---

## Innovation & Impact

### Novel Aspects

1. **Hybrid Approach**: Combines ML classification with rule-based fallback
2. **Real Discovery**: Analyzes truly NEW data, not just NASA catalog
3. **User-Friendly**: No programming required to discover planets
4. **Full Pipeline**: End-to-end from raw light curves to stored discoveries

### Real-World Applications

1. **TESS Data Analysis**: Process ongoing TESS mission data
2. **Citizen Science**: Enable amateur astronomers to contribute
3. **Follow-up Prioritization**: Focus telescope time on best candidates
4. **Historical Data**: Re-analyze archived data for missed planets

### Performance Metrics

- **Speed**: <1 second classification
- **Accuracy**: 79% (comparable to published research)
- **Scalability**: Can process thousands of light curves
- **Reliability**: Cross-validated on multiple datasets

---

## Future Enhancements

1. **Deep Learning**: Implement CNN for raw light curve analysis
2. **Active Learning**: Improve model with user feedback
3. **Batch Processing**: Upload multiple files at once
4. **Advanced Visualization**: 3D orbital plots, habitability zones
5. **Export Features**: Download results as CSV/JSON
6. **API Access**: Public API for programmatic access
7. **Mobile App**: iOS/Android apps for discovery on-the-go

---

## Conclusion

This project demonstrates a complete solution to the NASA Space Apps Challenge by:

1. ✅ Training on real NASA data from Kepler, K2, and TESS
2. ✅ Achieving competitive accuracy (79%) with automated classification
3. ✅ Providing an intuitive web interface for users
4. ✅ Enabling real exoplanet discovery from uploaded light curves
5. ✅ Displaying transparent model statistics and confidence
6. ✅ Using open-source tools and reproducible methods

**Our tool brings automated exoplanet detection to everyone** - from professional astronomers to students and space enthusiasts - accelerating the pace of discovery in the search for worlds beyond our solar system.

---

## Team & Resources

**Technologies**: Python, scikit-learn, Flask, Node.js, Express, Supabase, Plotly.js

**Data Sources**: NASA Exoplanet Archive (exoplanetarchive.ipac.caltech.edu)

**License**: MIT (Open Source)

**Repository**: https://github.com/[your-repo]/exoplanet-discovery-agent

---

**Built for NASA Space Apps Challenge 2024** 🚀🌌
