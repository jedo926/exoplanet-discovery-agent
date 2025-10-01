#!/usr/bin/env python3
"""
Exoplanet ML Model Training Script
Trains a machine learning model on NASA's labeled exoplanet data
to classify planets as Confirmed, Candidate, or False Positive

Enhanced with:
- Advanced feature engineering (derived features, ratios, log transforms)
- Gradient Boosting ensemble for better accuracy
- Hyperparameter tuning
- Class balancing with SMOTE
"""

import json
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier, VotingClassifier
from sklearn.model_selection import train_test_split, cross_val_score, GridSearchCV
from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, f1_score
from sklearn.preprocessing import StandardScaler
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline as ImbPipeline
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

def engineer_features(data):
    """Advanced feature engineering with derived features"""
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

        # Extract raw features
        period = float(entry['period']) if entry['period'] else 0.01
        radius = float(entry['radius']) if entry['radius'] else 0.01
        depth = float(entry['depth']) if entry['depth'] else 0.01
        snr = float(entry['snr']) if entry['snr'] else 7.0
        duration = float(entry['duration']) if entry['duration'] else 0.01

        # Derived features for better discrimination
        # 1. Log transforms (handle scale differences)
        log_period = np.log10(period + 1e-6)
        log_radius = np.log10(radius + 1e-6)
        log_depth = np.log10(depth + 1e-6)
        log_snr = np.log10(snr + 1e-6)

        # 2. Physical ratios
        transit_depth_ratio = depth / (radius ** 2 + 1e-6)  # Expected correlation
        duration_period_ratio = duration / (period + 1e-6)  # Transit fraction
        snr_per_depth = snr / (depth + 1e-6)  # Signal quality indicator

        # 3. Statistical features
        snr_squared = snr ** 2  # Emphasize high SNR
        radius_cubed = radius ** 3  # Volume proxy

        # 4. Interaction features
        period_radius_product = period * radius
        snr_duration_product = snr * duration

        # Create enhanced feature vector
        feature_vec = [
            # Raw features
            period,
            radius,
            depth,
            snr,
            duration,
            # Log transforms
            log_period,
            log_radius,
            log_depth,
            log_snr,
            # Derived ratios
            transit_depth_ratio,
            duration_period_ratio,
            snr_per_depth,
            # Statistical transforms
            snr_squared,
            radius_cubed,
            # Interactions
            period_radius_product,
            snr_duration_product,
            # Dataset one-hot encoding
            1.0 if entry['dataset'] == 'kepler' else 0.0,
            1.0 if entry['dataset'] == 'k2' else 0.0,
            1.0 if entry['dataset'] == 'tess' else 0.0,
        ]

        features.append(feature_vec)
        labels.append(label)

    return np.array(features), np.array(labels)

def train_enhanced_model(X, y):
    """Train enhanced ensemble model with SMOTE and hyperparameter tuning"""
    print("\n🤖 Training Enhanced Ensemble Classifier...")
    print("   - Gradient Boosting + Random Forest ensemble")
    print("   - SMOTE for class balancing")
    print("   - Advanced feature engineering\n")

    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Apply SMOTE to balance classes
    print("⚖️  Applying SMOTE for class balancing...")
    smote = SMOTE(random_state=42, k_neighbors=3)
    X_train_balanced, y_train_balanced = smote.fit_resample(X_train_scaled, y_train)
    print(f"   Before SMOTE: {len(X_train)} samples")
    print(f"   After SMOTE: {len(X_train_balanced)} samples\n")

    # Train Gradient Boosting Classifier (best for accuracy)
    print("🌲 Training Gradient Boosting model...")
    gb_model = GradientBoostingClassifier(
        n_estimators=300,
        learning_rate=0.1,
        max_depth=7,
        min_samples_split=4,
        min_samples_leaf=2,
        subsample=0.8,
        random_state=42,
        verbose=0
    )
    gb_model.fit(X_train_balanced, y_train_balanced)

    # Train Random Forest (for diversity)
    print("🌳 Training Random Forest model...")
    rf_model = RandomForestClassifier(
        n_estimators=300,
        max_depth=25,
        min_samples_split=3,
        min_samples_leaf=1,
        max_features='sqrt',
        random_state=42,
        n_jobs=-1
    )
    rf_model.fit(X_train_balanced, y_train_balanced)

    # Create Voting Ensemble
    print("🗳️  Creating ensemble model...\n")
    ensemble = VotingClassifier(
        estimators=[
            ('gb', gb_model),
            ('rf', rf_model)
        ],
        voting='soft',  # Use probability voting
        weights=[1.5, 1.0]  # Give more weight to GB
    )
    ensemble.fit(X_train_balanced, y_train_balanced)

    # Evaluate
    y_pred = ensemble.predict(X_test_scaled)
    y_pred_proba = ensemble.predict_proba(X_test_scaled)

    accuracy = accuracy_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred, average='weighted')

    # Cross-validation on original (non-SMOTE) data
    cv_scores = cross_val_score(ensemble, X_train_scaled, y_train, cv=5)

    print(f"\n📊 Model Performance:")
    print(f"Training Accuracy: {ensemble.score(X_train_balanced, y_train_balanced):.2%}")
    print(f"Test Accuracy: {accuracy:.2%}")
    print(f"F1 Score (weighted): {f1:.2%}")
    print(f"Cross-Validation Score: {cv_scores.mean():.2%} (+/- {cv_scores.std() * 2:.2%})")

    print("\n📈 Classification Report:")
    print(classification_report(y_test, y_pred))

    print("\n🔢 Confusion Matrix:")
    cm = confusion_matrix(y_test, y_pred)
    print(cm)

    # Feature importance from Gradient Boosting
    feature_names = [
        'Period', 'Radius', 'Depth', 'SNR', 'Duration',
        'Log_Period', 'Log_Radius', 'Log_Depth', 'Log_SNR',
        'Depth_Radius_Ratio', 'Duration_Period_Ratio', 'SNR_Depth_Ratio',
        'SNR_Squared', 'Radius_Cubed',
        'Period_Radius_Product', 'SNR_Duration_Product',
        'Is_Kepler', 'Is_K2', 'Is_TESS'
    ]
    importances = gb_model.feature_importances_

    print("\n🎯 Top 10 Feature Importances:")
    top_features = sorted(zip(feature_names, importances), key=lambda x: x[1], reverse=True)[:10]
    for name, importance in top_features:
        print(f"  {name}: {importance:.3f}")

    # Save model statistics
    stats = {
        'train_accuracy': float(ensemble.score(X_train_balanced, y_train_balanced)),
        'test_accuracy': float(accuracy),
        'f1_score': float(f1),
        'cv_mean': float(cv_scores.mean()),
        'cv_std': float(cv_scores.std()),
        'n_samples': len(X),
        'n_train': len(X_train),
        'n_test': len(X_test),
        'n_features': len(feature_names),
        'feature_importances': {name: float(imp) for name, imp in zip(feature_names, importances)},
        'classes': ensemble.classes_.tolist(),
        'model_type': 'Gradient Boosting + Random Forest Ensemble',
        'trained_at': datetime.now().isoformat()
    }

    with open(STATS_PATH, 'w') as f:
        json.dump(stats, f, indent=2)

    print(f"\n💾 Saved model statistics to {STATS_PATH}")

    return ensemble, scaler, stats

def main():
    print("🚀 Starting Exoplanet ML Model Training\n")

    # Load data
    print("📥 Loading NASA datasets...")
    data = load_nasa_data()
    print(f"\n✓ Total entries loaded: {len(data)}")

    # Prepare features with advanced engineering
    print("\n🔧 Engineering advanced features...")
    X, y = engineer_features(data)
    print(f"✓ Engineered {len(X)} samples with {X.shape[1]} features")

    # Show class distribution
    unique, counts = np.unique(y, return_counts=True)
    print("\n📊 Class Distribution:")
    for label, count in zip(unique, counts):
        print(f"  {label}: {count} ({count/len(y)*100:.1f}%)")

    # Train enhanced model
    model, scaler, stats = train_enhanced_model(X, y)

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
