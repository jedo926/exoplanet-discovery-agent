#!/usr/bin/env python3
"""
ML Prediction API for Exoplanet Classification
Flask server that loads the trained model and provides prediction endpoints
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import joblib
import numpy as np
import json
import os

app = Flask(__name__)
CORS(app)

# Load model and scaler
MODEL_PATH = 'exoplanet_classifier.pkl'
SCALER_PATH = 'feature_scaler.pkl'
STATS_PATH = 'model_stats.json'

print("🔄 Loading ML model...")
model = joblib.load(MODEL_PATH)
scaler = joblib.load(SCALER_PATH)

# Load model stats
with open(STATS_PATH, 'r') as f:
    model_stats = json.load(f)

print(f"✅ Model loaded successfully! Test Accuracy: {model_stats['test_accuracy']:.2%}")

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'model_loaded': True,
        'accuracy': model_stats['test_accuracy']
    })

@app.route('/stats', methods=['GET'])
def stats():
    """Return model statistics"""
    return jsonify(model_stats)

@app.route('/predict', methods=['POST'])
def predict():
    """
    Predict exoplanet classification

    Expected JSON body:
    {
        "period": 10.5,
        "radius": 2.3,
        "depth": 500.0,
        "snr": 15.0,
        "duration": 3.2,
        "dataset": "kepler"  // "kepler", "k2", or "tess"
    }
    """
    try:
        data = request.json

        # Extract features
        period = float(data.get('period', 0.0))
        radius = float(data.get('radius', 0.0))
        depth = float(data.get('depth', 0.0))
        snr = float(data.get('snr', 7.0))
        duration = float(data.get('duration', 0.0))
        dataset = data.get('dataset', '').lower()

        # Create feature vector (must match training format)
        features = np.array([[
            period,
            radius,
            depth,
            snr,
            duration,
            1.0 if dataset == 'kepler' else 0.0,
            1.0 if dataset == 'k2' else 0.0,
            1.0 if dataset == 'tess' else 0.0
        ]])

        # Scale features
        features_scaled = scaler.transform(features)

        # Get prediction
        prediction = model.predict(features_scaled)[0]
        probabilities = model.predict_proba(features_scaled)[0]

        # Get confidence (max probability)
        confidence = float(max(probabilities))

        # Map to class probabilities
        class_probs = {
            cls: float(prob)
            for cls, prob in zip(model.classes_, probabilities)
        }

        return jsonify({
            'classification': prediction,
            'confidence': confidence,
            'probabilities': class_probs,
            'features_used': {
                'period': period,
                'radius': radius,
                'depth': depth,
                'snr': snr,
                'duration': duration,
                'dataset': dataset
            }
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 400

@app.route('/predict_batch', methods=['POST'])
def predict_batch():
    """
    Predict classifications for multiple planets

    Expected JSON body:
    {
        "planets": [
            {"period": 10.5, "radius": 2.3, ...},
            {"period": 5.2, "radius": 1.8, ...}
        ]
    }
    """
    try:
        data = request.json
        planets = data.get('planets', [])

        if not planets:
            return jsonify({'error': 'No planets provided'}), 400

        results = []

        for planet_data in planets:
            # Extract features
            period = float(planet_data.get('period', 0.0))
            radius = float(planet_data.get('radius', 0.0))
            depth = float(planet_data.get('depth', 0.0))
            snr = float(planet_data.get('snr', 7.0))
            duration = float(planet_data.get('duration', 0.0))
            dataset = planet_data.get('dataset', '').lower()

            # Create feature vector
            features = np.array([[
                period,
                radius,
                depth,
                snr,
                duration,
                1.0 if dataset == 'kepler' else 0.0,
                1.0 if dataset == 'k2' else 0.0,
                1.0 if dataset == 'tess' else 0.0
            ]])

            # Scale and predict
            features_scaled = scaler.transform(features)
            prediction = model.predict(features_scaled)[0]
            probabilities = model.predict_proba(features_scaled)[0]
            confidence = float(max(probabilities))

            results.append({
                'classification': prediction,
                'confidence': confidence,
                'planet_data': planet_data
            })

        return jsonify({
            'predictions': results,
            'count': len(results)
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 400

if __name__ == '__main__':
    print("\n🚀 Starting ML Prediction API on port 5001...")
    print("Endpoints:")
    print("  GET  /health - Health check")
    print("  GET  /stats - Model statistics")
    print("  POST /predict - Single prediction")
    print("  POST /predict_batch - Batch predictions")
    app.run(host='0.0.0.0', port=5001, debug=True)
