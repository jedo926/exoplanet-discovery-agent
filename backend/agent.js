const axios = require('axios');
const Papa = require('papaparse');
const { createClient } = require('@supabase/supabase-js');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'your-supabase-url-here';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'your-supabase-key-here';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ML Model API
const ML_API_URL = 'http://localhost:5001';

// NASA Exoplanet Archive API
const NASA_EXOPLANET_API = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync';

/**
 * Fetch host star information from NASA Exoplanet Archive
 */
async function fetchHostStarInfo(ticId) {
  if (!ticId) return null;

  try {
    // Extract numeric TIC ID
    const ticNumber = ticId.toString().replace(/[^0-9]/g, '');
    if (!ticNumber) return null;

    console.log(`Fetching host star info for TIC ${ticNumber}...`);

    // Query TESS Objects of Interest (TOI) table
    const query = `SELECT TOP 1 tid, toipfx, ra, dec, st_tmag, st_rad, st_mass, st_teff
                   FROM toi
                   WHERE tid=${ticNumber}`;

    const response = await axios.get(NASA_EXOPLANET_API, {
      params: {
        query: query,
        format: 'json'
      },
      timeout: 5000
    });

    if (response.data && response.data.length > 0) {
      const star = response.data[0];
      const hostName = star.toipfx ? `TOI-${star.toipfx.split('.')[0]}` : `TIC ${ticNumber}`;

      console.log(`Found host star: ${hostName}`);

      return {
        name: hostName,
        tic_id: ticNumber,
        ra: star.ra,
        dec: star.dec,
        magnitude: star.st_tmag,
        radius: star.st_rad,
        mass: star.st_mass,
        temperature: star.st_teff
      };
    }

    // If not found in TOI, try Kepler/K2
    const keplerQuery = `SELECT TOP 1 kepid, kepoi_name, ra, dec, koi_steff, koi_srad, koi_smass
                         FROM koi
                         WHERE kepid=${ticNumber}`;

    const keplerResponse = await axios.get(NASA_EXOPLANET_API, {
      params: {
        query: keplerQuery,
        format: 'json'
      },
      timeout: 5000
    });

    if (keplerResponse.data && keplerResponse.data.length > 0) {
      const star = keplerResponse.data[0];
      const hostName = star.kepoi_name ? `Kepler-${star.kepoi_name.split('-')[0]}` : `KIC ${ticNumber}`;

      console.log(`Found host star: ${hostName}`);

      return {
        name: hostName,
        kepler_id: ticNumber,
        ra: star.ra,
        dec: star.dec,
        radius: star.koi_srad,
        mass: star.koi_smass,
        temperature: star.koi_steff
      };
    }

    console.log(`No host star info found for TIC ${ticNumber}`);
    return null;

  } catch (error) {
    console.error('Error fetching host star info:', error.message);
    return null;
  }
}

/**
 * Calculate confidence score based on data quality metrics
 * @param {Object} features - Planet features (period, radius, depth, snr)
 * @param {string} type - 'confirmed' or 'candidate'
 * @returns {number} - Confidence score between 0.50 and 0.99
 */
function calculateConfidence(features, type) {
  let baseConfidence = type === 'confirmed' ? 0.90 : 0.70;
  let confidenceAdjustment = 0;

  // SNR Quality (Signal-to-Noise Ratio)
  if (features.snr !== null && features.snr !== undefined) {
    if (features.snr > 50) {
      confidenceAdjustment += 0.08; // Excellent SNR
    } else if (features.snr > 20) {
      confidenceAdjustment += 0.05; // Very good SNR
    } else if (features.snr > 10) {
      confidenceAdjustment += 0.02; // Good SNR
    } else if (features.snr < 7) {
      confidenceAdjustment -= 0.10; // Poor SNR
    }
  }

  // Physical plausibility checks
  if (features.orbital_period > 0 && features.orbital_period < 500) {
    confidenceAdjustment += 0.02; // Reasonable period
  }

  if (features.planetary_radius > 0.5 && features.planetary_radius < 20) {
    confidenceAdjustment += 0.02; // Reasonable size
  } else if (features.planetary_radius > 20 || features.planetary_radius < 0.3) {
    confidenceAdjustment -= 0.05; // Unusual size
  }

  // Transit depth check
  if (features.transit_depth > 0 && features.transit_depth < 50000) {
    confidenceAdjustment += 0.01; // Measurable transit
  }

  // Final confidence (clamped between 0.5 and 0.99)
  const finalConfidence = Math.max(0.50, Math.min(0.99, baseConfidence + confidenceAdjustment));

  return Math.round(finalConfidence * 100) / 100; // Round to 2 decimals
}


/**
 * Parse CSV light curve data
 */
function parseCSV(csvContent) {
  return new Promise((resolve, reject) => {
    // Remove comment lines (lines starting with #)
    const cleanedContent = csvContent
      .split('\n')
      .filter(line => !line.trim().startsWith('#'))
      .join('\n');

    Papa.parse(cleanedContent, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      comments: '#', // Also tell PapaParse to skip comments
      complete: (results) => resolve(results.data),
      error: (error) => reject(error)
    });
  });
}

/**
 * Intelligently detect time column based on data characteristics
 */
function detectTimeColumn(lightCurveData) {
  if (!lightCurveData || lightCurveData.length === 0) return null;

  const columns = Object.keys(lightCurveData[0]);

  // Keywords that suggest time-related columns
  const timeKeywords = ['time', 'bjd', 'jd', 'mjd', 'date', 'epoch', 'barycentric', 'hjd'];

  // First, try name-based matching
  for (const col of columns) {
    const colLower = col.toLowerCase();
    if (timeKeywords.some(keyword => colLower.includes(keyword))) {
      const values = lightCurveData.map(row => row[col]).filter(v => v != null && !isNaN(v));
      if (values.length > 0) return col;
    }
  }

  // If no name match, look for monotonically increasing column (characteristic of time)
  for (const col of columns) {
    const values = lightCurveData.map(row => row[col]).filter(v => v != null && !isNaN(v));
    if (values.length < 10) continue;

    // Check if values are mostly increasing
    let increasingCount = 0;
    for (let i = 1; i < Math.min(values.length, 100); i++) {
      if (values[i] > values[i-1]) increasingCount++;
    }

    if (increasingCount > values.length * 0.9) {
      return col;
    }
  }

  return null;
}

/**
 * Intelligently detect flux column based on data characteristics
 */
function detectFluxColumn(lightCurveData, timeColumn) {
  if (!lightCurveData || lightCurveData.length === 0) return null;

  const columns = Object.keys(lightCurveData[0]).filter(col => col !== timeColumn);

  // Keywords that suggest flux-related columns (prioritized order)
  const fluxKeywords = ['flux', 'sap_flux', 'pdcsap_flux', 'sap', 'pdcsap', 'intensity', 'signal', 'brightness', 'lc'];

  // Exclude columns that are NOT flux (stellar properties, metadata)
  const excludeKeywords = ['kepmag', 'ra', 'dec', 'teff', 'logg', 'feh', 'rad', 'mass', 'id', 'name', 'koi_', 'tic_', 'toi_', 'epic_'];

  // First, try name-based matching with exclusions
  for (const col of columns) {
    const colLower = col.toLowerCase();

    // Skip if column matches exclusion patterns
    if (excludeKeywords.some(keyword => colLower.includes(keyword))) {
      continue;
    }

    if (fluxKeywords.some(keyword => colLower.includes(keyword))) {
      const values = lightCurveData.map(row => row[col]).filter(v => v != null && !isNaN(v));
      if (values.length > 0) return col;
    }
  }

  // If no name match, find the column with most variation (typical of flux with transits)
  let bestCol = null;
  let maxVariation = 0;

  for (const col of columns) {
    const colLower = col.toLowerCase();

    // Skip excluded columns
    if (excludeKeywords.some(keyword => colLower.includes(keyword))) {
      continue;
    }

    const values = lightCurveData.map(row => row[col]).filter(v => v != null && !isNaN(v));
    if (values.length < 10) continue;

    // Skip if all values are the same (constant column, not flux)
    const uniqueValues = new Set(values);
    if (uniqueValues.size < 2) continue;

    // Calculate coefficient of variation
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
    const coefficientOfVariation = Math.sqrt(variance) / Math.abs(mean);

    if (coefficientOfVariation > maxVariation && coefficientOfVariation < 1) { // CV should be reasonable for flux
      maxVariation = coefficientOfVariation;
      bestCol = col;
    }
  }

  return bestCol;
}

/**
 * Detect multiple periodic signals using Box Least Squares (BLS) algorithm
 */
function detectMultiplePeriods(times, fluxes, numPlanets = 5) {
  const detectedPeriods = [];
  let residualFluxes = [...fluxes];

  const meanFlux = fluxes.reduce((a, b) => a + b, 0) / fluxes.length;
  const stdFlux = Math.sqrt(fluxes.reduce((sum, f) => sum + Math.pow(f - meanFlux, 2), 0) / fluxes.length);

  const timeDiff = times[times.length - 1] - times[0];
  const minPeriod = 0.5; // days
  const maxPeriod = Math.min(timeDiff / 3, 500); // days

  // Track detected periods to avoid duplicates
  const detectedPeriodValues = [];

  // Search for up to numPlanets periodic signals
  for (let planetNum = 0; planetNum < numPlanets; planetNum++) {
    let bestPeriod = null;
    let bestDepth = 0;
    let bestSNR = 0;
    let bestTransitIndices = [];

    // Increase SNR threshold for subsequent planets (lowered for better sensitivity)
    const snrThreshold = 2 + (planetNum * 0.5); // 2, 2.5, 3, 3.5, 4

    // Test periods from 0.5 to maxPeriod days
    const periodSteps = 200;
    for (let i = 0; i < periodSteps; i++) {
      const period = minPeriod + (maxPeriod - minPeriod) * (i / periodSteps);

      // Check if this period is too similar to already detected periods
      const isTooSimilar = detectedPeriodValues.some(detectedP => {
        const ratio = period / detectedP;
        // Reject if within 10% of detected period or if it's a harmonic (2x, 3x, 0.5x, 0.33x)
        return Math.abs(ratio - 1) < 0.1 ||
               Math.abs(ratio - 2) < 0.1 ||
               Math.abs(ratio - 3) < 0.1 ||
               Math.abs(ratio - 0.5) < 0.1 ||
               Math.abs(ratio - 0.33) < 0.1;
      });

      if (isTooSimilar) continue;

      // Phase-fold the data
      const phases = times.map(t => (t % period) / period);

      // Look for transit-like dips in phase-folded data
      const phaseBins = 50;
      const binnedFlux = new Array(phaseBins).fill(0);
      const binnedCount = new Array(phaseBins).fill(0);

      for (let j = 0; j < phases.length; j++) {
        const bin = Math.floor(phases[j] * phaseBins);
        if (bin >= 0 && bin < phaseBins) {
          binnedFlux[bin] += residualFluxes[j];
          binnedCount[bin]++;
        }
      }

      // Calculate mean flux per bin
      const binnedMean = binnedFlux.map((sum, idx) =>
        binnedCount[idx] > 0 ? sum / binnedCount[idx] : meanFlux
      );

      // Find the deepest bin (potential transit)
      const transitBin = binnedMean.indexOf(Math.min(...binnedMean));
      const transitDepth = (meanFlux - binnedMean[transitBin]) / meanFlux * 1e6; // ppm

      // Calculate SNR for this period
      const snr = transitDepth / (stdFlux / meanFlux * 1e6);

      // Keep track of best period (with increasing threshold, lowered depth threshold for small planets)
      if (snr > bestSNR && snr > snrThreshold && transitDepth > 5) {
        bestSNR = snr;
        bestPeriod = period;
        bestDepth = transitDepth;

        // Find indices of points in transit
        bestTransitIndices = [];
        const transitPhaseStart = (transitBin - 1) / phaseBins;
        const transitPhaseEnd = (transitBin + 2) / phaseBins;

        for (let j = 0; j < phases.length; j++) {
          if (phases[j] >= transitPhaseStart && phases[j] <= transitPhaseEnd) {
            bestTransitIndices.push(j);
          }
        }
      }
    }

    // Debug log for first iteration
    if (planetNum === 0) {
      console.log(`  First planet search: Best SNR=${bestSNR.toFixed(2)}, Depth=${bestDepth.toFixed(1)}ppm, Period=${bestPeriod ? bestPeriod.toFixed(2) : 'none'}d, Threshold=${snrThreshold}`);
    }

    // If we found a significant signal, add it and remove from residuals
    if (bestPeriod && bestSNR > snrThreshold) {
      const transitDuration = (bestPeriod * 0.1) * 24; // hours
      const planetaryRadius = Math.sqrt(bestDepth / 1e6) * 11; // Earth radii

      detectedPeriods.push({
        orbital_period: bestPeriod,
        transit_depth: bestDepth,
        snr: bestSNR,
        transit_duration: transitDuration,
        planetary_radius: planetaryRadius,
        odd_even_diff: Math.abs(stdFlux * 0.1),
        data_points: times.length,
        mean_flux: meanFlux,
        std_flux: stdFlux
      });

      // Track this period to avoid duplicates
      detectedPeriodValues.push(bestPeriod);

      // Remove this signal from residuals for next iteration
      // More aggressive masking: mask all points in the transit phase window
      const phases = times.map(t => (t % bestPeriod) / bestPeriod);
      const transitBin = Math.floor(phases.findIndex((p, idx) => {
        return residualFluxes[idx] < meanFlux - (bestDepth / 1e6 * meanFlux);
      }) / 50);

      for (let idx = 0; idx < phases.length; idx++) {
        const phaseBin = Math.floor(phases[idx] * 50);
        // Mask wider window around transit
        if (Math.abs(phaseBin - transitBin) <= 2 || Math.abs(phaseBin - transitBin) >= 48) {
          residualFluxes[idx] = meanFlux;
        }
      }

      console.log(`Detected planet ${planetNum + 1}: Period=${bestPeriod.toFixed(2)}d, Depth=${bestDepth.toFixed(0)}ppm, SNR=${bestSNR.toFixed(1)}`);
    } else {
      // No more significant signals found
      break;
    }
  }

  return detectedPeriods;
}

/**
 * Extract features using Python BLS (more accurate than JS implementation)
 */
async function extractFeaturesWithPython(csvPath) {
  try {
    const scriptPath = path.join(__dirname, '../ml_model/analyze_lightcurve.py');

    // Debug: Check temp file
    const fileContent = await fs.readFile(csvPath, 'utf-8');
    const lines = fileContent.split('\n').slice(0, 5);
    console.log(`Temp CSV first 5 lines:\n${lines.join('\n')}`);

    const { stdout, stderr } = await execAsync(`python3 "${scriptPath}" "${csvPath}"`, {
      timeout: 60000
    });

    if (stderr && !stderr.includes('UserWarning')) {
      console.error('Python stderr:', stderr);
    }

    const result = JSON.parse(stdout.trim());

    if (result.error) {
      throw new Error(result.error);
    }

    if (!result.detected || result.num_planets === 0) {
      console.log(`No planets detected in ${result.data_points} data points`);
      return [];
    }

    console.log(`Found ${result.num_planets} planet candidate(s): Period=${result.planets[0].orbital_period.toFixed(2)}d, SNR=${result.planets[0].snr.toFixed(2)}`);

    // Return all detected planets with standardized format
    return result.planets.map(planet => ({
      orbital_period: planet.orbital_period,
      transit_depth: planet.transit_depth,
      snr: planet.snr,
      transit_duration: planet.transit_duration,
      planetary_radius: planet.planetary_radius,
      odd_even_diff: 0,  // Not calculated in Python version
      data_points: result.data_points,
      mean_flux: result.mean_flux,
      std_flux: result.std_flux
    }));
  } catch (error) {
    console.error('Python BLS error:', error);
    throw error;
  }
}

/**
 * Extract features from light curve data (now returns array of planet candidates)
 */
function extractFeatures(lightCurveData) {
  try {
    if (!lightCurveData || lightCurveData.length === 0) {
      throw new Error('No data provided');
    }

    // Intelligently detect time and flux columns
    const timeColumn = detectTimeColumn(lightCurveData);
    const fluxColumn = detectFluxColumn(lightCurveData, timeColumn);

    if (!timeColumn || !fluxColumn) {
      const availableColumns = Object.keys(lightCurveData[0]).join(', ');
      throw new Error(`Could not automatically detect time or flux columns. Available columns: ${availableColumns}. Please ensure your file has time-series data.`);
    }

    console.log(`Auto-detected columns: time="${timeColumn}", flux="${fluxColumn}"`);

    // Extract the data
    const times = lightCurveData.map(row => row[timeColumn]).filter(t => t != null && !isNaN(t));
    const fluxes = lightCurveData.map(row => row[fluxColumn]).filter(f => f != null && !isNaN(f));

    if (times.length === 0 || fluxes.length === 0) {
      throw new Error('No valid numeric data found in detected columns');
    }

    // Detect multiple planets in the light curve
    const detectedPlanets = detectMultiplePeriods(times, fluxes, 5);

    console.log(`Found ${detectedPlanets.length} potential planet candidate(s) in light curve`);

    return detectedPlanets;
  } catch (error) {
    console.error('Feature extraction error:', error);
    throw error;
  }
}


/**
 * Generate natural language explanation using templates
 */
async function generateAIExplanation(features, classification, probability) {
  try {
    const period = features.orbital_period?.toFixed(0) || 'unknown';
    const radius = features.planetary_radius?.toFixed(1) || 'unknown';
    const confidence = (probability * 100).toFixed(1);

    // Determine planet size comparison
    let sizeComparison = '';
    const r = parseFloat(radius);
    if (r < 0.5) sizeComparison = 'smaller than Earth';
    else if (r < 1.5) sizeComparison = 'similar to Earth';
    else if (r < 2.5) sizeComparison = 'a "super-Earth"';
    else if (r < 6) sizeComparison = 'a Neptune-sized planet';
    else sizeComparison = 'a Jupiter-sized giant';

    // Generate explanation based on classification
    let explanation = '';
    if (classification === 'Confirmed Planet' || classification === 'Candidate Planet') {
      explanation = `Exciting news! We've discovered a candidate exoplanet that orbits its star every ${period} days, and it's about ${radius} times the size of Earth—think of it as ${sizeComparison}! `;
      explanation += `With a solid detection signal, this planet might have unique properties that could help us understand more about planetary systems beyond our own. `;
      explanation += `Each new discovery like this brings us closer to answering the big questions about life elsewhere in the universe!`;
    } else {
      explanation = `This detection shows a periodic signal with a ${period}-day period, but further analysis is needed to confirm if it's truly a planet. `;
      explanation += `The candidate would be approximately ${radius} Earth radii if confirmed. More observations will help us determine the true nature of this signal.`;
    }

    return explanation;
  } catch (error) {
    console.error('Explanation generation error:', error.message);
    return null;
  }
}

/**
 * Fallback rule-based classification
 */
function fallbackClassification(features) {
  let classification = 'False Positive';
  let probability = 0.3;
  let reasoning = 'Rule-based classification due to AI unavailability';

  if (features.snr && features.snr > 10 &&
      features.orbital_period > 0.5 &&
      features.orbital_period < 500 &&
      features.planetary_radius > 0.5 &&
      features.planetary_radius < 20) {
    classification = 'Confirmed Planet';
    probability = calculateConfidence(features, 'confirmed');
    reasoning = 'High SNR and physically plausible parameters';
  } else if (features.snr && features.snr > 5 && features.orbital_period > 0.5) {
    classification = 'Candidate Planet';
    probability = calculateConfidence(features, 'candidate');
    reasoning = 'Moderate SNR, needs follow-up observation';
  }

  return { classification, probability, reasoning };
}

/**
 * ML-based classification using trained model
 */
async function classifyWithML(features, dataset) {
  try {
    const response = await axios.post(`${ML_API_URL}/predict`, {
      period: features.orbital_period || 0,
      radius: features.planetary_radius || 0,
      depth: features.transit_depth || 0,
      snr: features.snr || 7,
      duration: features.transit_duration || 0,
      dataset: dataset
    });

    return {
      classification: response.data.classification,
      probability: response.data.confidence,
      reasoning: `ML model prediction (confidence: ${(response.data.confidence * 100).toFixed(1)}%)`
    };
  } catch (error) {
    console.error('ML classification error:', error.message);
    // Fallback to rule-based if ML API is down
    return fallbackClassification(features);
  }
}

/**
 * Store planet in Supabase
 */
async function storePlanet(planetData) {
  try {
    const { data, error } = await supabase
      .from('exoplanets')
      .insert([planetData])
      .select();

    if (error) throw error;

    console.log('Planet stored in database:', data);
    return data;
  } catch (error) {
    console.error('Error storing planet:', error);
    throw error;
  }
}

/**
 * Get all planets from Supabase
 */
async function getAllPlanets() {
  try {
    const { data, error } = await supabase
      .from('exoplanets')
      .select('*')
      .order('discovery_date', { ascending: false });

    if (error) throw error;

    // Deduplicate planets based on host star + orbital period (relaxed)
    const seen = new Map();
    const uniquePlanets = [];

    for (const planet of data) {
      // Create a unique key based on host star and period (rounded to 1 decimal)
      // Skip deduplication for "Unknown" host stars to show all discoveries
      const key = planet.host_star === 'Unknown'
        ? `${planet.planet_name}`
        : `${planet.host_star}:${planet.period.toFixed(1)}`;

      if (!seen.has(key)) {
        seen.set(key, true);
        uniquePlanets.push(planet);
      } else {
        console.log(`Filtering duplicate planet from display: ${planet.planet_name} (${key})`);
      }
    }

    return uniquePlanets;
  } catch (error) {
    console.error('Error fetching planets:', error);
    throw error;
  }
}

/**
 * Check if planet already exists in database
 */
async function planetExists(planetName, hostStar = null, period = null) {
  try {
    // Check by exact name first
    const { data: nameMatch } = await supabase
      .from('exoplanets')
      .select('planet_name')
      .eq('planet_name', planetName)
      .limit(1)
      .maybeSingle();

    if (nameMatch) return true;

    // If we have host star and period, check for duplicate by orbital characteristics
    // Relaxed: only check if host star is known (not "Unknown")
    if (hostStar && hostStar !== 'Unknown' && period) {
      const { data: orbitMatch } = await supabase
        .from('exoplanets')
        .select('planet_name, period, host_star')
        .eq('host_star', hostStar)
        .limit(10);

      if (orbitMatch && orbitMatch.length > 0) {
        // Check if any existing planet has very similar period (within 1% - much tighter)
        const duplicate = orbitMatch.find(planet => {
          const periodDiff = Math.abs(planet.period - period);
          const percentDiff = (periodDiff / period) * 100;
          return percentDiff < 1; // Same planet only if period within 1%
        });

        if (duplicate) {
          console.log(`Duplicate detected: ${duplicate.planet_name} has similar period ${duplicate.period.toFixed(2)}d vs ${period.toFixed(2)}d`);
          return true;
        }
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking planet existence:', error);
    return false;
  }
}


/**
 * Generate phase-folded light curve plot data
 */
function generatePlotData(lightCurveData, period) {
  try {
    if (!lightCurveData || lightCurveData.length === 0) {
      console.log('No light curve data for plot');
      return [];
    }

    // Detect time and flux columns
    const timeCol = detectTimeColumn(lightCurveData);
    const fluxCol = detectFluxColumn(lightCurveData);

    if (!timeCol || !fluxCol) {
      console.log(`Could not detect columns for plot. Time: ${timeCol}, Flux: ${fluxCol}`);
      return [];
    }

    const times = lightCurveData.map(row => row[timeCol]).filter(t => t != null && !isNaN(t));
    const fluxes = lightCurveData.map(row => row[fluxCol]).filter(f => f != null && !isNaN(f));

    if (times.length === 0 || fluxes.length === 0) {
      console.log(`No valid data for plot. Times: ${times.length}, Fluxes: ${fluxes.length}`);
      return [];
    }

    // Normalize fluxes
    const meanFlux = fluxes.reduce((a, b) => a + b, 0) / fluxes.length;
    const normalizedFluxes = fluxes.map(f => f / meanFlux);

    // Phase-fold the data
    const phases = times.map(t => ((t % period) / period));

    // Create plot data (limit to 2000 points for performance)
    const step = Math.ceil(phases.length / 2000);
    const plotData = phases
      .map((phase, i) => ({
        x: phase,
        y: normalizedFluxes[i]
      }))
      .filter((_, i) => i % step === 0)
      .sort((a, b) => a.x - b.x);

    console.log(`Generated ${plotData.length} plot points`);
    return plotData;
  } catch (error) {
    console.error('Error generating plot data:', error);
    return [];
  }
}

/**
 * Main analysis function - now detects multiple planets per file
 */
async function analyzeLightCurve(csvContent, ticId = null) {
  let tempFilePath = null;
  try {
    // Write CSV to temp file for Python processing
    const tempDir = path.join(__dirname, '../temp');
    await fs.mkdir(tempDir, { recursive: true });
    tempFilePath = path.join(tempDir, `temp_${Date.now()}.csv`);
    await fs.writeFile(tempFilePath, csvContent);

    // Parse CSV for plot data
    const lightCurveData = await parseCSV(csvContent);

    if (lightCurveData.length === 0) {
      throw new Error('No valid data in CSV file');
    }

    // Fetch host star information if TIC ID provided
    let hostStarInfo = null;
    let hostStarName = 'Unknown';

    if (ticId) {
      hostStarInfo = await fetchHostStarInfo(ticId);
      if (hostStarInfo) {
        hostStarName = hostStarInfo.name;
        console.log(`Using host star: ${hostStarName}`);
      } else {
        hostStarName = `TIC ${ticId}`;
      }
    }

    // Extract features using Python BLS (more accurate)
    const detectedPlanets = await extractFeaturesWithPython(tempFilePath);

    if (detectedPlanets.length === 0) {
      // No planets detected - return a false positive result
      return {
        planets: [],
        totalDetected: 0,
        hostStar: hostStarName,
        hostStarInfo: hostStarInfo,
        message: 'No significant planetary signals detected in this light curve'
      };
    }

    // Process each detected planet
    const results = [];
    let storedCount = 0;

    for (let i = 0; i < detectedPlanets.length; i++) {
      const features = detectedPlanets[i];

      // Classify with ML model
      const aiResult = await classifyWithML(features, 'uploaded');

      // Override ML if BLS detected a strong signal (SNR > 3)
      let finalClassification = aiResult.classification;
      let finalProbability = aiResult.probability;

      if (features.snr > 3 && aiResult.classification === 'False Positive') {
        finalClassification = 'Candidate Planet';
        // Use SNR-based confidence: higher SNR = higher confidence (cap at 95%)
        const snrConfidence = Math.min(0.95, 0.5 + (features.snr - 3) * 0.08);
        finalProbability = Math.max(snrConfidence, aiResult.probability);
        console.log(`Overriding ML classification: BLS SNR=${features.snr.toFixed(2)} suggests planet candidate (confidence: ${(finalProbability*100).toFixed(1)}%)`);
      }

      // Generate AI explanation for users
      const aiExplanation = await generateAIExplanation(features, finalClassification, finalProbability);

      // Generate plot data
      const plotData = generatePlotData(lightCurveData, features.orbital_period);

      // Store if confirmed or candidate (relaxed for demo - store all detections)
      let stored = false;
      console.log(`Planet ${i+1}: Classification=${finalClassification}, Probability=${finalProbability.toFixed(2)}, Period=${features.orbital_period.toFixed(2)}d`);

      if (finalClassification !== 'False Positive' && finalProbability > 0.3) {  // Lowered threshold from 0.5 to 0.3
        // Generate consistent planet name based on host star + period (avoid duplicates on re-run)
        const periodHash = Math.round(features.orbital_period * 1000); // Hash based on period
        const planetName = ticId
          ? `TIC-${ticId}-${String.fromCharCode(98 + i)}`
          : `${hostStarName}-${periodHash}-${String.fromCharCode(98 + i)}`;

        // Check for duplicates by name, host star, and orbital period
        const exists = await planetExists(planetName, hostStarName, features.orbital_period);
        if (!exists) {
          console.log(`✓ Storing planet: ${planetName}`);
        } else {
          console.log(`✗ Skipping duplicate: ${planetName} (Period: ${features.orbital_period.toFixed(2)}d)`);
        }

        if (!exists) {
          await storePlanet({
            planet_name: planetName,
            host_star: hostStarName,
            period: features.orbital_period,
            radius: features.planetary_radius,
            depth: features.transit_depth,
            classification: finalClassification,
            probability: finalProbability,
            discovery_date: new Date().toISOString(),
            dataset: 'uploaded'
          });
          stored = true;
          storedCount++;
        } else {
          console.log(`Skipping duplicate planet: ${planetName} (Period: ${features.orbital_period.toFixed(2)}d)`);
        }
      }

      results.push({
        planetNumber: i + 1,
        features,
        classification: finalClassification,
        probability: finalProbability,
        reasoning: aiResult.reasoning,
        aiExplanation: aiExplanation || aiResult.reasoning,
        plotData,
        stored
      });
    }

    return {
      planets: results,
      totalDetected: detectedPlanets.length,
      storedCount: storedCount,
      hostStar: hostStarName,
      hostStarInfo: hostStarInfo,
      message: `Detected ${detectedPlanets.length} planet candidate(s) around ${hostStarName}, ${storedCount} stored in database`
    };
  } catch (error) {
    console.error('Analysis error:', error);
    throw error;
  } finally {
    // Cleanup temp file
    if (tempFilePath) {
      try {
        await fs.unlink(tempFilePath);
      } catch (err) {
        console.error('Error deleting temp file:', err);
      }
    }
  }
}


/**
 * Get ML model statistics
 */
async function getMLModelStats() {
  try {
    const response = await axios.get(`${ML_API_URL}/stats`);
    return response.data;
  } catch (error) {
    console.error('Error fetching ML stats:', error.message);
    return null;
  }
}

module.exports = {
  analyzeLightCurve,
  getAllPlanets,
  getMLModelStats
};
