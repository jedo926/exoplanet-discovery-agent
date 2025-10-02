#!/usr/bin/env python3
"""
Enhanced light curve analysis using lightkurve's BLS
"""
import sys
import json
import pandas as pd
import numpy as np
from astropy import units as u
from lightkurve import LightCurve

def analyze_lightcurve(csv_path):
    """Analyze a light curve CSV and detect transits using BLS"""
    try:
        # Try to read CSV with various delimiters and options
        df = None
        for sep in [',', '\t', ';', '|', ' ']:
            try:
                df = pd.read_csv(csv_path, sep=sep, on_bad_lines='skip', engine='python', comment='#')
                if len(df.columns) >= 2 and len(df) > 10:  # Need at least 2 columns and 10 rows
                    break
            except:
                continue

        if df is None or len(df) < 10:
            return {"error": "Could not parse file or insufficient data"}

        # Auto-detect columns - very flexible pattern matching
        time_col = None
        flux_col = None
        cadence_col = None
        error_col = None

        for col in df.columns:
            col_lower = str(col).lower().strip()

            # Skip error columns entirely
            if any(keyword in col_lower for keyword in ['error', 'err', 'uncertainty', 'sigma']):
                error_col = col
                continue

            # Time column detection (avoid corrections)
            if any(keyword in col_lower for keyword in ['bjd', 'jd', 'hjd', 'mjd', 'date', 'epoch']):
                time_col = col
            elif 'time' in col_lower and 'corr' not in col_lower:  # Avoid timecorr
                time_col = col

            # Cadence detection
            if any(keyword in col_lower for keyword in ['cadence', 'frame', 'index']):
                cadence_col = col

            # Flux column detection (very flexible, but avoid error/quality columns)
            if any(keyword in col_lower for keyword in ['flux', 'intensity', 'mag', 'brightness', 'count', 'signal', 'adu', 'electron']):
                # Skip background, quality, and position correction columns
                if any(skip in col_lower for skip in ['bkg', 'background', 'quality', 'pos_corr', 'centr']):
                    continue

                # Prefer PDCSAP (de-trended) > SAP > normalized > any flux
                if 'pdcsap_flux' == col_lower and 'err' not in col_lower:
                    flux_col = col
                elif flux_col is None or ('sap_flux' == col_lower and flux_col not in ['pdcsap_flux']):
                    flux_col = col
                elif flux_col is None:  # Take any flux column
                    flux_col = col

        # If still no flux column, use the column with most variation (likely the flux)
        if not flux_col:
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            if len(numeric_cols) >= 1:
                # Find column with highest coefficient of variation
                cv_vals = {}
                for col in numeric_cols:
                    try:
                        data = df[col].dropna()
                        if len(data) > 10:
                            cv = np.std(data) / np.abs(np.mean(data)) if np.mean(data) != 0 else 0
                            cv_vals[col] = cv
                    except:
                        continue

                if cv_vals:
                    # Skip time-like columns (monotonically increasing)
                    for col in sorted(cv_vals, key=cv_vals.get, reverse=True):
                        data = df[col].dropna().values
                        if len(data) > 10:
                            # Check if monotonic (likely time column)
                            if not (np.all(np.diff(data) >= 0) or np.all(np.diff(data) <= 0)):
                                flux_col = col
                                break

            if not flux_col:
                return {"error": "Could not automatically detect flux column. Please ensure data has time and flux columns."}

        # Print what we detected
        print(f"Detected columns - Time: {time_col}, Flux: {flux_col}, Cadence: {cadence_col}", file=sys.stderr)

        # Priority: time column > cadence number > auto-detect monotonic > row index
        if time_col:
            # Clean data
            df = df[[time_col, flux_col]].dropna()
            times = df[time_col].values
            fluxes = df[flux_col].values
            print(f"Using time column '{time_col}': {len(times)} points", file=sys.stderr)
        elif cadence_col:
            # Use cadence number as time (Kepler long cadence = 29.4 min = 0.0204 days)
            df = df[[cadence_col, flux_col]].dropna()
            cadence_values = df[cadence_col].values

            # Convert cadence to relative time (days since first cadence)
            cadence_min = cadence_values.min()
            times = (cadence_values - cadence_min) * 0.0204  # Relative time in days
            fluxes = df[flux_col].values

            print(f"Using cadence column '{cadence_col}': {len(times)} points, time span: {times.max():.1f} days", file=sys.stderr)
        else:
            # Try to find a monotonically increasing numeric column (likely time)
            numeric_cols = df.select_dtypes(include=[np.number]).columns
            found_time = False

            for col in numeric_cols:
                if col == flux_col:
                    continue
                try:
                    data = df[col].dropna().values
                    if len(data) > 10 and np.all(np.diff(data) > 0):  # Strictly increasing
                        time_col = col
                        df = df[[time_col, flux_col]].dropna()
                        times = df[time_col].values
                        fluxes = df[flux_col].values
                        found_time = True
                        print(f"Auto-detected time column: {col}", file=sys.stderr)
                        break
                except:
                    continue

            if not found_time:
                # Fallback: use row index as time
                df = df[[flux_col]].dropna()
                times = np.arange(len(df), dtype=float) * 0.0204  # Assume Kepler cadence
                fluxes = df[flux_col].values
                print("Using row index as time (assuming Kepler 29.4 min cadence)", file=sys.stderr)

        # Create LightCurve object
        lc = LightCurve(time=times, flux=fluxes)

        # Normalize
        lc = lc.normalize()

        # Remove outliers - but be conservative to preserve transits
        lc = lc.remove_outliers(sigma=10)

        # Detect multiple planets (up to 10)
        planets = []
        lc_work = lc.copy()

        # Determine period search range based on data span
        time_span = float(times.max() - times.min())

        # If we have long-baseline data (>300 days), search wider periods
        if time_span > 300:
            # For long baseline: search 0.5 to 1/3 of time span (ensure multiple transits)
            max_period = min(time_span / 3.0, 500)  # Cap at 500 days
            period_grid = np.linspace(0.5, max_period, 8000)
            print(f"Long baseline detected ({time_span:.1f} days). Searching periods up to {max_period:.1f} days", file=sys.stderr)
        else:
            # Standard short-period search (0.5-50 days)
            period_grid = np.linspace(0.5, 50, 5000)
            print(f"Standard search: 0.5-50 days (data span: {time_span:.1f} days)", file=sys.stderr)

        for i in range(10):  # Try to find up to 10 planets
            # Run BLS on current light curve
            bls = lc_work.to_periodogram(method='bls', period=period_grid)

            # Calculate SNR
            bls_power = bls.power.value
            max_power = bls_power.max()
            median_power = np.median(bls_power)
            std_power = np.std(bls_power)
            snr = (max_power - median_power) / std_power if std_power > 0 else 0

            # Check if signal is strong enough
            threshold = 2.5 + (i * 0.5)  # Increase threshold for each subsequent planet
            if snr < threshold:
                break

            # Get planet parameters
            planet_period = bls.period_at_max_power
            planet_t0 = bls.transit_time_at_max_power
            planet_depth = bls.depth_at_max_power
            transit_duration = 0.1 * planet_period.value * 24  # hours
            planet_radius = np.sqrt(planet_depth) * 109  # Earth radii

            planets.append({
                "orbital_period": float(planet_period.value),
                "transit_time": float(planet_t0.value),
                "transit_depth": float(planet_depth * 1e6),  # ppm
                "snr": float(snr),
                "transit_duration": float(transit_duration),
                "planetary_radius": float(planet_radius),
            })

            # Remove this planet's signal by masking transits
            try:
                # Calculate phase for all points
                period_val = planet_period.value
                t0_val = planet_t0.value
                phase = np.mod(lc_work.time.value - t0_val, period_val) / period_val

                # Normalize phase to [-0.5, 0.5]
                phase = np.where(phase > 0.5, phase - 1, phase)

                # Mask points near phase 0 (transit) - 10% window
                transit_mask = np.abs(phase) < 0.1

                # Create new light curve without transit points
                lc_work = lc_work[~transit_mask]

                if len(lc_work.time) < 100:  # Not enough data left
                    break
            except Exception as e:
                print(f"Error masking planet {i+1}: {e}", file=sys.stderr)
                break

        results = {
            "detected": len(planets) > 0,
            "num_planets": len(planets),
            "planets": planets,
            "data_points": len(lc.time),
            "mean_flux": float(np.mean(lc.flux)),
            "std_flux": float(np.std(lc.flux))
        }

        # Backward compatibility - include first planet at top level
        if len(planets) > 0:
            results.update(planets[0])

        return results

    except Exception as e:
        return {"error": str(e)}

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)

    csv_path = sys.argv[1]
    result = analyze_lightcurve(csv_path)
    print(json.dumps(result))
