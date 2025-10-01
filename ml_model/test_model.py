#!/usr/bin/env python3
"""
Test the trained ML model with sample exoplanet data
"""

import requests
import json

# ML API endpoint
API_URL = 'http://localhost:5001'

# Sample test cases
test_cases = [
    {
        'name': 'Hot Jupiter (Confirmed)',
        'period': 3.5,
        'radius': 11.0,
        'depth': 15000.0,
        'snr': 50.0,
        'duration': 2.5,
        'dataset': 'kepler'
    },
    {
        'name': 'Super-Earth (Candidate)',
        'period': 10.5,
        'radius': 2.3,
        'depth': 800.0,
        'snr': 8.5,
        'duration': 3.2,
        'dataset': 'tess'
    },
    {
        'name': 'Likely False Positive',
        'period': 1.2,
        'radius': 0.3,
        'depth': 50.0,
        'snr': 3.5,
        'duration': 0.5,
        'dataset': 'k2'
    },
    {
        'name': 'Earth-like (Candidate)',
        'period': 365.0,
        'radius': 1.1,
        'depth': 84.0,
        'snr': 12.0,
        'duration': 13.0,
        'dataset': 'kepler'
    }
]

def test_prediction(data):
    """Test a single prediction"""
    try:
        response = requests.post(f'{API_URL}/predict', json=data, timeout=5)
        response.raise_for_status()
        return response.json()
    except requests.exceptions.ConnectionError:
        print("❌ Error: ML API not running. Start it with: python3 predict_api.py")
        return None
    except Exception as e:
        print(f"❌ Error: {e}")
        return None

def main():
    print("🧪 Testing Exoplanet ML Model\n")
    print("=" * 70)

    # Check if API is running
    try:
        health = requests.get(f'{API_URL}/health', timeout=2)
        if health.status_code == 200:
            stats = health.json()
            print(f"✅ ML API is running (Accuracy: {stats.get('accuracy', 0):.2%})\n")
        else:
            print("⚠️  ML API returned unexpected status\n")
    except:
        print("❌ ML API is not running. Start it with: python3 predict_api.py\n")
        return

    # Test each case
    for i, test_case in enumerate(test_cases, 1):
        print(f"\nTest {i}: {test_case['name']}")
        print("-" * 70)

        # Remove 'name' from the data sent to API
        test_data = {k: v for k, v in test_case.items() if k != 'name'}

        result = test_prediction(test_data)

        if result:
            print(f"📊 Classification: {result['classification']}")
            print(f"🎯 Confidence: {result['confidence']*100:.1f}%")
            print(f"📈 Probabilities:")
            for cls, prob in result.get('probabilities', {}).items():
                print(f"   - {cls}: {prob*100:.1f}%")
        else:
            print("❌ Test failed")

    print("\n" + "=" * 70)
    print("✅ Testing complete!")
    print("\nNext steps:")
    print("  1. Start the Node.js server: npm start")
    print("  2. Open http://localhost:3000")
    print("  3. Upload a light curve CSV file to discover planets!")

if __name__ == '__main__':
    main()
