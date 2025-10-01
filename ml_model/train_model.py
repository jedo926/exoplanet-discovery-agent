#!/usr/bin/env python3
"""
Exoplanet ML Model Training Script
Trains a machine learning model on NASA's labeled exoplanet data
to classify planets as Confirmed, Candidate, or False Positive
"""

import json
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split, cross_val_score
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score
from sklearn.preprocessing import StandardScaler
import joblib
import os
from datetime import datetime

# Paths
CACHE_DIR = '../cache'
MODEL_DIR = '.'
MODEL_PATH = os.path.join(MODEL_DIR, 'exoplanet_classifier.pkl')
SCALER_PATH = os.path.join(MODEL_DIR, 'feature_scaler.pkl')
STATS_PATH = os.path.join(MODEL_DIR, 'model_stats.json')

def load_nasa_data():
    """Load all NASA datasets from cache"""
    datasets = []

    # Load Kepler data
    kepler_path = os.path.join(CACHE_DIR, 'kepler_data.json')
    if os.path.exists(kepler_path):
        with open(kepler_path, 'r') as f:
            kepler_data = json.load(f)
            for entry in kepler_data:
                datasets.append({
                    'name': entry.get('kepler_name', ''),
                    'period': entry.get('koi_period'),
                    'radius': entry.get('koi_prad'),
                    'depth': entry.get('koi_depth'),
                    'snr': entry.get('koi_model_snr'),
                    'duration': entry.get('koi_duration'),
                    'disposition': entry.get('koi_pdisposition', '').upper(),
                    'dataset': 'kepler'
                })
        print(f"✓ Loaded {len(kepler_data)} Kepler entries")

    # Load K2 data
    k2_path = os.path.join(CACHE_DIR, 'k2_data.json')
    if os.path.exists(k2_path):
        with open(k2_path, 'r') as f:
            k2_data = json.load(f)
            for entry in k2_data:
                datasets.append({
                    'name': entry.get('pl_name', ''),
                    'period': entry.get('pl_orbper'),
                    'radius': entry.get('pl_rade'),
                    'depth': entry.get('pl_trandep'),
                    'snr': None,  # K2 doesn't have SNR
                    'duration': entry.get('pl_trandur'),
                    'disposition': entry.get('disposition', '').upper(),
                    'dataset': 'k2'
                })
        print(f"✓ Loaded {len(k2_data)} K2 entries")

    # Load TESS data
    tess_path = os.path.join(CACHE_DIR, 'tess_data.json')
    if os.path.exists(tess_path):
        with open(tess_path, 'r') as f:
            tess_data = json.load(f)
            for entry in tess_data:
                datasets.append({
                    'name': entry.get('toi', ''),
                    'period': entry.get('pl_orbper'),
                    'radius': entry.get('pl_rade'),
                    'depth': entry.get('pl_trandep'),
                    'snr': None,  # TESS doesn't have SNR in TAP
                    'duration': entry.get('pl_trandur'),
                    'disposition': entry.get('tfopwg_disp', '').upper(),
                    'dataset': 'tess'
                })
        print(f"✓ Loaded {len(tess_data)} TESS entries")

    return datasets

def prepare_features(data):
    """Extract features and labels from NASA data"""
    features = []
    labels = []

    for entry in data:
        # Skip entries with missing critical data
        if entry['period'] is None or entry['radius'] is None:
            continue

        # Map NASA dispositions to our labels
        disposition = entry['disposition']
        if 'CONFIRMED' in disposition or disposition == 'CP':
            label = 'Confirmed Planet'
        elif 'CANDIDATE' in disposition or disposition == 'PC' or disposition == 'KP':
            label = 'Candidate Planet'
        elif 'FALSE' in disposition or disposition == 'FP':
            label = 'False Positive'
        else:
            continue  # Skip unknown dispositions

        # Create feature vector
        feature_vec = [
            float(entry['period']) if entry['period'] else 0.0,
            float(entry['radius']) if entry['radius'] else 0.0,
            float(entry['depth']) if entry['depth'] else 0.0,
            float(entry['snr']) if entry['snr'] else 7.0,  # Default SNR
            float(entry['duration']) if entry['duration'] else 0.0,
            1.0 if entry['dataset'] == 'kepler' else 0.0,
            1.0 if entry['dataset'] == 'k2' else 0.0,
            1.0 if entry['dataset'] == 'tess' else 0.0,
        ]

        features.append(feature_vec)
        labels.append(label)

    return np.array(features), np.array(labels)

def train_model(X, y):
    """Train Random Forest classifier"""
    print("\n🤖 Training Random Forest Classifier...")

    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Train Random Forest
    model = RandomForestClassifier(
        n_estimators=200,
        max_depth=20,
        min_samples_split=5,
        min_samples_leaf=2,
        random_state=42,
        n_jobs=-1
    )

    model.fit(X_train_scaled, y_train)

    # Evaluate
    y_pred = model.predict(X_test_scaled)
    accuracy = accuracy_score(y_test, y_pred)

    # Cross-validation
    cv_scores = cross_val_score(model, X_train_scaled, y_train, cv=5)

    print(f"\n📊 Model Performance:")
    print(f"Training Accuracy: {model.score(X_train_scaled, y_train):.2%}")
    print(f"Test Accuracy: {accuracy:.2%}")
    print(f"Cross-Validation Score: {cv_scores.mean():.2%} (+/- {cv_scores.std() * 2:.2%})")

    print("\n📈 Classification Report:")
    print(classification_report(y_test, y_pred))

    print("\n🔢 Confusion Matrix:")
    print(confusion_matrix(y_test, y_pred))

    # Feature importance
    feature_names = ['Period', 'Radius', 'Depth', 'SNR', 'Duration', 'Is_Kepler', 'Is_K2', 'Is_TESS']
    importances = model.feature_importances_

    print("\n🎯 Feature Importances:")
    for name, importance in sorted(zip(feature_names, importances), key=lambda x: x[1], reverse=True):
        print(f"  {name}: {importance:.3f}")

    # Save model statistics
    stats = {
        'train_accuracy': float(model.score(X_train_scaled, y_train)),
        'test_accuracy': float(accuracy),
        'cv_mean': float(cv_scores.mean()),
        'cv_std': float(cv_scores.std()),
        'n_samples': len(X),
        'n_train': len(X_train),
        'n_test': len(X_test),
        'feature_importances': {name: float(imp) for name, imp in zip(feature_names, importances)},
        'classes': model.classes_.tolist(),
        'trained_at': datetime.now().isoformat()
    }

    with open(STATS_PATH, 'w') as f:
        json.dump(stats, f, indent=2)

    print(f"\n💾 Saved model statistics to {STATS_PATH}")

    return model, scaler, stats

def main():
    print("🚀 Starting Exoplanet ML Model Training\n")

    # Load data
    print("📥 Loading NASA datasets...")
    data = load_nasa_data()
    print(f"\n✓ Total entries loaded: {len(data)}")

    # Prepare features
    print("\n🔧 Preparing features and labels...")
    X, y = prepare_features(data)
    print(f"✓ Prepared {len(X)} samples with {X.shape[1]} features")

    # Show class distribution
    unique, counts = np.unique(y, return_counts=True)
    print("\n📊 Class Distribution:")
    for label, count in zip(unique, counts):
        print(f"  {label}: {count} ({count/len(y)*100:.1f}%)")

    # Train model
    model, scaler, stats = train_model(X, y)

    # Save model and scaler
    print(f"\n💾 Saving model to {MODEL_PATH}...")
    joblib.dump(model, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)

    print("\n✅ Training Complete!")
    print(f"Model saved to: {MODEL_PATH}")
    print(f"Scaler saved to: {SCALER_PATH}")
    print(f"Stats saved to: {STATS_PATH}")
    print(f"\nFinal Test Accuracy: {stats['test_accuracy']:.2%}")

if __name__ == '__main__':
    main()
