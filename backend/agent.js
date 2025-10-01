const axios = require('axios');
const Papa = require('papaparse');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'your-supabase-url-here';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'your-supabase-key-here';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Initialize Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Initialize OpenAI client
const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

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

  // Search for up to numPlanets periodic signals
  for (let planetNum = 0; planetNum < numPlanets; planetNum++) {
    let bestPeriod = null;
    let bestDepth = 0;
    let bestSNR = 0;
    let bestTransitIndices = [];

    // Test periods from 0.5 to maxPeriod days
    const periodSteps = 200;
    for (let i = 0; i < periodSteps; i++) {
      const period = minPeriod + (maxPeriod - minPeriod) * (i / periodSteps);

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

      // Keep track of best period
      if (snr > bestSNR && snr > 3 && transitDepth > 10) { // Minimum thresholds
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

    // If we found a significant signal, add it and remove from residuals
    if (bestPeriod && bestSNR > 3) {
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

      // Remove this signal from residuals for next iteration
      // Set transit points closer to mean to "mask" the signal
      for (const idx of bestTransitIndices) {
        residualFluxes[idx] = meanFlux;
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
 * Generate natural language explanation using OpenAI
 */
async function generateAIExplanation(features, classification, probability) {
  if (!openai) {
    return null; // OpenAI not configured
  }

  try {
    const prompt = `You are an astronomy educator explaining exoplanet discoveries to non-scientists.

A light curve analysis has detected the following:

Classification: ${classification}
Confidence: ${(probability * 100).toFixed(1)}%

Planet Characteristics:
- Orbital Period: ${features.orbital_period?.toFixed(2)} days
- Planet Radius: ${features.planetary_radius?.toFixed(2)} Earth radii
- Transit Depth: ${features.transit_depth?.toFixed(0)} parts per million
- Signal Quality (SNR): ${features.snr?.toFixed(1)}
- Transit Duration: ${features.transit_duration?.toFixed(2)} hours

Generate a friendly, educational explanation in 2-3 sentences that:
1. Explains what this means in plain English
2. Compares the planet to something familiar (Jupiter, Earth, etc.)
3. Mentions why this discovery is interesting or significant

Keep it under 100 words, enthusiastic but scientifically accurate.`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are an enthusiastic astronomy educator who makes space discoveries accessible to everyone." },
        { role: "user", content: prompt }
      ],
      max_tokens: 150,
      temperature: 0.7
    });

    return completion.choices[0].message.content.trim();
  } catch (error) {
    console.error('OpenAI explanation error:', error.message);
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
 * Main analysis function - now detects multiple planets per file
 */
async function analyzeLightCurve(csvContent, ticId = null) {
  try {
    // Parse CSV
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

    // Extract features - now returns array of detected planets
    const detectedPlanets = extractFeatures(lightCurveData);

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

      // Generate AI explanation for users
      const aiExplanation = await generateAIExplanation(features, aiResult.classification, aiResult.probability);

      // Generate plot data
      const plotData = generatePlotData(lightCurveData, features.orbital_period);

      // Store if confirmed or candidate
      let stored = false;
      if (aiResult.classification !== 'False Positive' && aiResult.probability > 0.5) {
        const planetName = ticId ? `TIC-${ticId}-${String.fromCharCode(98 + i)}` : `Planet-${Date.now()}-${i + 1}`;

        const exists = await planetExists(planetName);
        if (!exists) {
          await storePlanet({
            planet_name: planetName,
            host_star: hostStarName,
            period: features.orbital_period,
            radius: features.planetary_radius,
            depth: features.transit_depth,
            classification: aiResult.classification,
            probability: aiResult.probability,
            discovery_date: new Date().toISOString(),
            dataset: 'uploaded'
          });
          stored = true;
          storedCount++;
        }
      }

      results.push({
        planetNumber: i + 1,
        features,
        classification: aiResult.classification,
        probability: aiResult.probability,
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
