const axios = require('axios');
const Papa = require('papaparse');
const { createClient } = require('@supabase/supabase-js');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'your-supabase-url-here';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'your-supabase-key-here';

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ML Model API
const ML_API_URL = 'http://localhost:5001';

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

  // Keywords that suggest flux-related columns
  const fluxKeywords = ['flux', 'mag', 'brightness', 'intensity', 'signal', 'sap', 'pdcsap', 'lc'];

  // First, try name-based matching
  for (const col of columns) {
    const colLower = col.toLowerCase();
    if (fluxKeywords.some(keyword => colLower.includes(keyword))) {
      const values = lightCurveData.map(row => row[col]).filter(v => v != null && !isNaN(v));
      if (values.length > 0) return col;
    }
  }

  // If no name match, find the column with most variation (typical of flux with transits)
  let bestCol = null;
  let maxVariation = 0;

  for (const col of columns) {
    const values = lightCurveData.map(row => row[col]).filter(v => v != null && !isNaN(v));
    if (values.length < 10) continue;

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
 * Extract features from light curve data
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

    // Calculate statistics
    const meanFlux = fluxes.reduce((a, b) => a + b, 0) / fluxes.length;
    const stdFlux = Math.sqrt(fluxes.reduce((sum, f) => sum + Math.pow(f - meanFlux, 2), 0) / fluxes.length);

    // Find transit depth (minimum flux deviation)
    const minFlux = Math.min(...fluxes);
    const transitDepth = ((meanFlux - minFlux) / meanFlux) * 1e6; // in ppm

    // Estimate SNR
    const snr = transitDepth / (stdFlux / meanFlux * 1e6);

    // Estimate period (simplified - find recurring patterns)
    const timeDiff = times[times.length - 1] - times[0];
    const estimatedPeriod = timeDiff / 10; // rough estimate

    // Transit duration (simplified)
    const transitDuration = estimatedPeriod * 0.1; // ~10% of period

    // Planetary radius (simplified calculation)
    const planetaryRadius = Math.sqrt(transitDepth / 1e6) * 11; // Earth radii estimate

    // Odd-even depth difference (simplified)
    const oddEvenDiff = Math.abs(stdFlux * 0.1);

    return {
      orbital_period: estimatedPeriod,
      transit_duration: transitDuration,
      planetary_radius: planetaryRadius,
      transit_depth: transitDepth,
      snr: snr,
      odd_even_diff: oddEvenDiff,
      data_points: times.length,
      mean_flux: meanFlux,
      std_flux: stdFlux
    };
  } catch (error) {
    console.error('Feature extraction error:', error);
    throw error;
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

    return data;
  } catch (error) {
    console.error('Error fetching planets:', error);
    throw error;
  }
}

/**
 * Check if planet already exists in database
 */
async function planetExists(planetName) {
  try {
    const { data } = await supabase
      .from('exoplanets')
      .select('planet_name')
      .eq('planet_name', planetName)
      .limit(1)
      .maybeSingle();

    return data !== null;
  } catch (error) {
    return false;
  }
}


/**
 * Generate phase-folded light curve plot data
 */
function generatePlotData(lightCurveData, period) {
  try {
    const times = lightCurveData.map(row => row.time || row.TIME || row.bjd).filter(t => t != null);
    const fluxes = lightCurveData.map(row => row.flux || row.FLUX || row.sap_flux).filter(f => f != null);

    // Phase-fold the data
    const phases = times.map(t => ((t % period) / period));

    // Create plot data
    const plotData = phases.map((phase, i) => ({
      x: phase,
      y: fluxes[i]
    })).sort((a, b) => a.x - b.x);

    return plotData;
  } catch (error) {
    console.error('Error generating plot data:', error);
    return [];
  }
}

/**
 * Main analysis function
 */
async function analyzeLightCurve(csvContent, ticId = null) {
  try {
    // Parse CSV
    const lightCurveData = await parseCSV(csvContent);

    if (lightCurveData.length === 0) {
      throw new Error('No valid data in CSV file');
    }

    // Extract features
    const features = extractFeatures(lightCurveData);

    // Classify with ML model
    const aiResult = await classifyWithML(features, 'uploaded');

    // Generate plot data
    const plotData = generatePlotData(lightCurveData, features.orbital_period);

    // Store if confirmed or candidate
    let stored = false;
    if (aiResult.classification !== 'False Positive' && aiResult.probability > 0.5) {
      const planetName = ticId ? `TIC-${ticId}` : `Planet-${Date.now()}`;

      const exists = await planetExists(planetName);
      if (!exists) {
        await storePlanet({
          planet_name: planetName,
          host_star: ticId || 'Unknown',
          period: features.orbital_period,
          radius: features.planetary_radius,
          depth: features.transit_depth,
          classification: aiResult.classification,
          probability: aiResult.probability,
          discovery_date: new Date().toISOString(),
          dataset: 'uploaded'
        });
        stored = true;
      }
    }

    return {
      features,
      classification: aiResult.classification,
      probability: aiResult.probability,
      reasoning: aiResult.reasoning,
      plotData,
      stored
    };
  } catch (error) {
    console.error('Analysis error:', error);
    throw error;
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
  classifyWithML,
  extractFeatures,
  getMLModelStats
};
