#!/usr/bin/env python3
"""
Fetch NASA Exoplanet Data for Model Training
Downloads data from NASA Exoplanet Archive TAP service
"""

import requests
import json
import os
from urllib.parse import quote

# Cache directory
CACHE_DIR = '../cache'

# NASA Exoplanet Archive TAP endpoints
NASA_TAP_BASE = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync'

# Queries for each dataset
QUERIES = {
    'kepler': {
        'table': 'cumulative',
        'columns': [
            'kepoi_name', 'kepler_name', 'koi_period', 'koi_prad',
            'koi_depth', 'koi_duration', 'koi_model_snr', 'koi_pdisposition'
        ],
        'description': 'Kepler Objects of Interest (KOI) - Cumulative Table'
    },
    'k2': {
        'table': 'k2pandc',
        'columns': ['*'],  # Get all columns
        'description': 'K2 Planets and Candidates'
    },
    'tess': {
        'table': 'toi',
        'columns': ['*'],  # Get all columns
        'description': 'TESS Objects of Interest (TOI)'
    }
}

def build_query(table, columns):
    """Build TAP query string"""
    if '*' in columns:
        cols = '*'
    else:
        cols = ','.join(columns)
    query = f"SELECT {cols} FROM {table}"
    return query

def fetch_dataset(name, config):
    """Fetch a single dataset from NASA TAP service"""
    print(f"\n📡 Fetching {config['description']}...")

    query = build_query(config['table'], config['columns'])

    params = {
        'query': query,
        'format': 'json'
    }

    try:
        response = requests.get(NASA_TAP_BASE, params=params, timeout=60)
        response.raise_for_status()

        data = response.json()

        # Handle different response formats
        if isinstance(data, list):
            entries = data
        elif isinstance(data, dict) and 'data' in data:
            entries = data['data']
        else:
            entries = data

        print(f"✓ Fetched {len(entries)} entries from {name.upper()}")
        return entries

    except requests.exceptions.RequestException as e:
        print(f"✗ Error fetching {name} data: {e}")
        return []

def save_to_cache(name, data):
    """Save data to cache directory"""
    os.makedirs(CACHE_DIR, exist_ok=True)
    cache_file = os.path.join(CACHE_DIR, f'{name}_data.json')

    with open(cache_file, 'w') as f:
        json.dump(data, f, indent=2)

    print(f"💾 Saved to {cache_file}")

def main():
    """Fetch all NASA datasets"""
    print("🚀 NASA Exoplanet Data Fetcher")
    print("=" * 50)

    for name, config in QUERIES.items():
        data = fetch_dataset(name, config)

        if data:
            save_to_cache(name, data)
        else:
            print(f"⚠️  Warning: No data fetched for {name}")

    print("\n" + "=" * 50)
    print("✅ Data fetch complete!")
    print(f"\nNext step: Run train_model.py to train the ML model")

if __name__ == '__main__':
    main()
