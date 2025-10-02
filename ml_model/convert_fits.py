#!/usr/bin/env python3
"""
Convert FITS light curve files to CSV format
"""
import sys
import pandas as pd
import numpy as np

def convert_fits_to_csv(fits_path):
    """Convert a FITS light curve file to CSV format"""
    try:
        # Try lightkurve first (best for Kepler/TESS)
        try:
            from lightkurve import read
            lc = read(fits_path)

            df = pd.DataFrame({
                'time': lc.time.value,
                'flux': lc.flux.value
            })

            df = df.dropna()

            if len(df) == 0:
                return {"error": "No valid data after removing NaN values"}

            csv_content = df.to_csv(index=False)

            return {
                "success": True,
                "csv": csv_content,
                "points": len(df),
                "method": "lightkurve"
            }

        except Exception as lk_error:
            # Fallback to astropy with byte order handling
            from astropy.io import fits

            with fits.open(fits_path, memmap=False) as hdul:
                data = hdul[1].data

                # Find time column
                time_col = None
                for col in ['TIME', 'time', 'BJD', 'bjd', 'JD', 'jd', 'MJD', 'mjd']:
                    if col in data.names:
                        time_col = col
                        break

                # Find flux column (prefer PDC-SAP over SAP)
                flux_col = None
                for col in ['PDCSAP_FLUX', 'pdcsap_flux', 'SAP_FLUX', 'sap_flux', 'FLUX', 'flux']:
                    if col in data.names:
                        flux_col = col
                        break

                if not time_col or not flux_col:
                    return {
                        "error": f"Could not find time/flux columns. Available: {', '.join(data.names)}"
                    }

                # Convert to native byte order to avoid endianness issues
                time_data = np.array(data[time_col], dtype=np.float64)
                flux_data = np.array(data[flux_col], dtype=np.float64)

                df = pd.DataFrame({
                    'time': time_data,
                    'flux': flux_data
                })

                df = df.dropna()

                if len(df) == 0:
                    return {"error": "No valid data after removing NaN values"}

                csv_content = df.to_csv(index=False)

                return {
                    "success": True,
                    "csv": csv_content,
                    "points": len(df),
                    "method": "astropy"
                }

    except Exception as e:
        return {"error": f"FITS conversion error: {str(e)}"}

if __name__ == '__main__':
    import json

    if len(sys.argv) < 2:
        print(json.dumps({"error": "No file path provided"}))
        sys.exit(1)

    fits_path = sys.argv[1]
    result = convert_fits_to_csv(fits_path)

    if "csv" in result:
        # Print just the CSV content for piping
        print(result["csv"])
    else:
        # Print error as JSON to stderr
        print(json.dumps(result), file=sys.stderr)
        sys.exit(1)
