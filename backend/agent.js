const axios = require('axios');
const Papa = require('papaparse');
const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || 'your-openai-api-key-here';
const SUPABASE_URL = process.env.SUPABASE_URL || 'your-supabase-url-here';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'your-supabase-key-here';

// Initialize clients
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// NASA API endpoints - filtering for transit method planets
const NASA_APIS = {
  kepler: 'https://exoplanetarchive.ipac.caltech.edu/cgi-bin/nstedAPI/nph-nstedAPI?table=cumulative&where=koi_pdisposition like \'CANDIDATE\' or koi_pdisposition like \'CONFIRMED\'',
  k2: 'https://exoplanetarchive.ipac.caltech.edu/cgi-bin/nstedAPI/nph-nstedAPI?table=k2candidates',
  tess: 'https://exoplanetarchive.ipac.caltech.edu/cgi-bin/nstedAPI/nph-nstedAPI?table=toi&where=toi_disposition like \'%PC%\' or toi_disposition like \'%CP%\'',
  confirmed: 'https://exoplanetarchive.ipac.caltech.edu/cgi-bin/nstedAPI/nph-nstedAPI?table=ps&where=discoverymethod like \'Transit\''
};

// Cache directory
const CACHE_DIR = path.join(__dirname, '../cache');

// Planet type images (using NASA exoplanet images)
const PLANET_IMAGES = {
  gas_giant: 'https://science.nasa.gov/wp-content/uploads/2023/09/gasgiants-pia22946-16.jpg',
  hot_jupiter: 'https://science.nasa.gov/wp-content/uploads/2023/09/hotjupiter-pia22087-16.jpg',
  neptune_like: 'https://science.nasa.gov/wp-content/uploads/2023/09/neptunelike-pia23408-16.jpg',
  super_earth: 'https://science.nasa.gov/wp-content/uploads/2023/09/superearth-pia22424-16.jpg',
  terrestrial: 'https://science.nasa.gov/wp-content/uploads/2023/09/terrestrial-pia22093-16.jpg',
  unknown: 'https://science.nasa.gov/wp-content/uploads/2023/09/pia23408-16.jpg'
};

/**
 * Determine planet type based on radius and period
 */
function getPlanetType(radius, period) {
  if (!radius || radius === 0) return 'unknown';

  // Hot Jupiter: Large radius, short period
  if (radius > 8 && period < 10) return 'hot_jupiter';

  // Gas Giant: Large radius
  if (radius > 8) return 'gas_giant';

  // Neptune-like: Medium-large radius
  if (radius >= 4 && radius <= 8) return 'neptune_like';

  // Super-Earth: Larger than Earth but smaller than Neptune
  if (radius >= 1.5 && radius < 4) return 'super_earth';

  // Terrestrial: Earth-sized or smaller
  if (radius < 1.5) return 'terrestrial';

  return 'unknown';
}

/**
 * Get planet image URL based on characteristics
 */
function getPlanetImage(radius, period) {
  const planetType = getPlanetType(radius, period);
  return PLANET_IMAGES[planetType];
}

/**
 * Search for real exoplanet images using NASA Images API
 */
async function searchNASAImage(planetName) {
  try {
    // Clean up planet name for search
    const cleanName = planetName.replace(/^(TIC-|TOI-|KOI-|Kepler-)/i, '').trim();

    // Search NASA Images API
    const searchUrl = `https://images-api.nasa.gov/search?q=${encodeURIComponent(planetName)}&media_type=image`;
    const response = await axios.get(searchUrl, { timeout: 5000 });

    if (response.data?.collection?.items?.length > 0) {
      const item = response.data.collection.items[0];

      // Get the image link
      if (item.links && item.links.length > 0) {
        const imageUrl = item.links[0].href;
        console.log(`✓ Found real image for ${planetName}: ${imageUrl}`);
        return imageUrl;
      }
    }

    // Also try searching with just the planet identifier
    if (cleanName !== planetName) {
      const altSearchUrl = `https://images-api.nasa.gov/search?q=exoplanet ${encodeURIComponent(cleanName)}&media_type=image`;
      const altResponse = await axios.get(altSearchUrl, { timeout: 5000 });

      if (altResponse.data?.collection?.items?.length > 0) {
        const item = altResponse.data.collection.items[0];
        if (item.links && item.links.length > 0) {
          const imageUrl = item.links[0].href;
          console.log(`✓ Found real image for ${planetName}: ${imageUrl}`);
          return imageUrl;
        }
      }
    }

    return null;
  } catch (error) {
    // Silently fail - we'll use fallback image
    return null;
  }
}

/**
 * Get planet image - tries real NASA image first, falls back to artist rendering
 */
async function getPlanetImageWithFallback(planetName, radius, period) {
  // Try to get real NASA image first
  const realImage = await searchNASAImage(planetName);

  if (realImage) {
    return realImage;
  }

  // Fall back to artist rendering based on planet type
  return getPlanetImage(radius, period);
}

/**
 * Ensure cache directory exists
 */
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating cache directory:', error);
  }
}

/**
 * Fetch NASA data with caching
 */
async function fetchNASAData(dataset = 'tess', forceRefresh = false) {
  await ensureCacheDir();
  const cacheFile = path.join(CACHE_DIR, `${dataset}_data.json`);

  // Check cache if not forcing refresh
  if (!forceRefresh) {
    try {
      const cached = await fs.readFile(cacheFile, 'utf-8');
      const data = JSON.parse(cached);
      console.log(`Loaded ${dataset} data from cache`);
      return data;
    } catch (error) {
      console.log(`No cache found for ${dataset}, fetching from API...`);
    }
  }

  // Fetch from NASA API
  try {
    const response = await axios.get(NASA_APIS[dataset] || NASA_APIS.tess, {
      params: { format: 'json' },
      timeout: 30000
    });

    // Cache the response
    await fs.writeFile(cacheFile, JSON.stringify(response.data, null, 2));
    console.log(`Cached ${dataset} data`);

    return response.data;
  } catch (error) {
    console.error(`Error fetching NASA data:`, error.message);
    throw error;
  }
}

/**
 * Parse CSV light curve data
 */
function parseCSV(csvContent) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvContent, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (error) => reject(error)
    });
  });
}

/**
 * Extract features from light curve data
 */
function extractFeatures(lightCurveData) {
  try {
    // Assuming light curve has time and flux columns
    const times = lightCurveData.map(row => row.time || row.TIME || row.bjd).filter(t => t != null);
    const fluxes = lightCurveData.map(row => row.flux || row.FLUX || row.sap_flux).filter(f => f != null);

    if (times.length === 0 || fluxes.length === 0) {
      throw new Error('Invalid light curve data: missing time or flux columns');
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
 * Use ChatGPT to classify exoplanet
 */
async function classifyWithAI(features, lightCurveData = null) {
  try {
    const prompt = `You are an expert astronomer analyzing exoplanet transit data. Based on the following features extracted from a light curve, classify this as either "Confirmed Planet", "Candidate Planet", or "False Positive".

Features:
- Orbital Period: ${features.orbital_period.toFixed(3)} days
- Transit Duration: ${features.transit_duration.toFixed(3)} days
- Planetary Radius: ${features.planetary_radius.toFixed(2)} Earth radii
- Transit Depth: ${features.transit_depth.toFixed(2)} ppm
- Signal-to-Noise Ratio: ${features.snr.toFixed(2)}
- Odd-Even Depth Difference: ${features.odd_even_diff.toFixed(2)}
- Data Points: ${features.data_points}

Criteria for classification:
- Confirmed Planet: SNR > 10, consistent transit depth, reasonable period (0.5-500 days), planetary radius (0.5-20 Earth radii)
- Candidate Planet: SNR > 5, mostly consistent features, needs follow-up
- False Positive: SNR < 5, inconsistent features, or non-physical parameters

Provide your classification and a probability score (0-1) in this exact JSON format:
{
  "classification": "Confirmed Planet" | "Candidate Planet" | "False Positive",
  "probability": 0.XX,
  "reasoning": "Brief explanation"
}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: "You are an expert exoplanet astronomer. Always respond with valid JSON only." },
        { role: "user", content: prompt }
      ],
      temperature: 0.3,
      max_tokens: 500
    });

    const response = completion.choices[0].message.content.trim();

    // Parse JSON response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return result;
    }

    throw new Error('Invalid AI response format');
  } catch (error) {
    console.error('AI classification error:', error);
    // Fallback to rule-based classification
    return fallbackClassification(features);
  }
}

/**
 * Fallback rule-based classification
 */
function fallbackClassification(features) {
  let classification = 'False Positive';
  let probability = 0.3;
  let reasoning = 'Rule-based classification due to AI unavailability';

  if (features.snr > 10 &&
      features.orbital_period > 0.5 &&
      features.orbital_period < 500 &&
      features.planetary_radius > 0.5 &&
      features.planetary_radius < 20) {
    classification = 'Confirmed Planet';
    probability = 0.85;
  } else if (features.snr > 5 && features.orbital_period > 0.5) {
    classification = 'Candidate Planet';
    probability = 0.65;
  }

  return { classification, probability, reasoning };
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
    const { data, error } = await supabase
      .from('exoplanets')
      .select('planet_name')
      .eq('planet_name', planetName)
      .single();

    return data !== null;
  } catch (error) {
    return false;
  }
}

/**
 * Check if planet exists in database efficiently
 */
async function checkPlanetExists(planetName) {
  try {
    const { data, error } = await supabase
      .from('exoplanets')
      .select('planet_name')
      .eq('planet_name', planetName)
      .limit(1)
      .maybeSingle();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    return data !== null;
  } catch (error) {
    console.error(`Error checking planet ${planetName}:`, error);
    return false;
  }
}

/**
 * Detect new planets by comparing NASA data with database (Transit method only)
 */
async function detectNewPlanets(dataset = 'tess') {
  try {
    console.log(`Scanning ${dataset.toUpperCase()} data for TRANSIT METHOD planets...`);

    const nasaData = await fetchNASAData(dataset);

    const newPlanets = [];

    // Process NASA data - only transit method planets
    const transitPlanets = nasaData.filter(entry => {
      const method = entry.discoverymethod || entry.koi_pdisposition || entry.toi_disposition || '';
      return method.toLowerCase().includes('transit') ||
             method.toLowerCase().includes('candidate') ||
             method.toLowerCase().includes('confirmed') ||
             method.toLowerCase().includes('pc') ||
             method.toLowerCase().includes('cp');
    });

    console.log(`Found ${transitPlanets.length} transit method planets in ${dataset.toUpperCase()}`);

    for (const entry of transitPlanets.slice(0, 100)) { // Process up to 100 transit planets
      const planetName = entry.pl_name ||
                        entry.kepler_name ||
                        entry.kepoi_name ||
                        (entry.tic_id ? `TIC-${entry.tic_id}` : null) ||
                        (entry.toi ? `TOI-${entry.toi}` : null) ||
                        `${dataset.toUpperCase()}-${Date.now()}`;

      // Check database efficiently for this specific planet
      const exists = await checkPlanetExists(planetName);

      if (!exists) {
        // Extract available features from NASA data
        const features = {
          orbital_period: entry.pl_orbper || entry.koi_period || entry.pl_orbpererr1 || 0,
          transit_duration: entry.pl_trandur || entry.koi_duration || 0,
          planetary_radius: entry.pl_rade || entry.koi_prad || entry.pl_radj || 0,
          transit_depth: entry.pl_trandep || entry.koi_depth || 0,
          snr: entry.koi_model_snr || entry.snr || 7,
          odd_even_diff: 0
        };

        // Skip if no valid orbital period
        if (features.orbital_period === 0 || features.orbital_period > 1000) {
          continue;
        }

        // Classify with AI
        const aiResult = await classifyWithAI(features);

        if (aiResult.classification !== 'False Positive' && aiResult.probability > 0.5) {
          // Try to get real NASA image first, fall back to artist rendering
          const imageUrl = await getPlanetImageWithFallback(
            planetName,
            features.planetary_radius,
            features.orbital_period
          );

          const planetData = {
            planet_name: planetName,
            host_star: entry.hostname || 'Unknown',
            period: features.orbital_period,
            radius: features.planetary_radius,
            depth: features.transit_depth,
            classification: aiResult.classification,
            probability: aiResult.probability,
            discovery_date: new Date().toISOString(),
            dataset: dataset,
            image_url: imageUrl
          };

          newPlanets.push(planetData);
          await storePlanet(planetData);
        }
      }
    }

    console.log(`Detected ${newPlanets.length} new planets`);
    return newPlanets;
  } catch (error) {
    console.error('Error detecting new planets:', error);
    throw error;
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

    // Classify with AI
    const aiResult = await classifyWithAI(features, lightCurveData);

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
 * Automatic startup scan - detects transit method planets from all NASA datasets
 */
async function autoScanOnStartup() {
  console.log('\n🔍 AUTO-SCAN: Starting automatic transit planet detection...\n');

  const datasets = ['tess', 'kepler', 'k2', 'confirmed'];
  let totalDiscovered = 0;

  for (const dataset of datasets) {
    try {
      console.log(`📡 Scanning ${dataset.toUpperCase()} for transit planets...`);
      const newPlanets = await detectNewPlanets(dataset);
      totalDiscovered += newPlanets.length;

      if (newPlanets.length > 0) {
        console.log(`✓ Discovered ${newPlanets.length} new transit planets from ${dataset.toUpperCase()}`);
      } else {
        console.log(`✓ ${dataset.toUpperCase()} scan complete - no new planets found`);
      }
    } catch (error) {
      console.error(`✗ Error scanning ${dataset}:`, error.message);
    }
  }

  console.log(`\n🌟 AUTO-SCAN COMPLETE: ${totalDiscovered} total transit planets discovered and stored\n`);
  return totalDiscovered;
}

module.exports = {
  analyzeLightCurve,
  fetchNASAData,
  detectNewPlanets,
  getAllPlanets,
  classifyWithAI,
  extractFeatures,
  autoScanOnStartup
};
