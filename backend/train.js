const { fetchNASAData, detectNewPlanets } = require('./agent');

/**
 * Training script to refresh NASA data and detect new planets
 */
async function trainAgent() {
  console.log('=== Exoplanet Discovery Agent Training ===\n');

  try {
    // Step 1: Fetch fresh NASA data for all datasets
    console.log('Step 1: Fetching fresh NASA data...');
    const datasets = ['tess', 'kepler', 'k2'];

    for (const dataset of datasets) {
      try {
        console.log(`Fetching ${dataset.toUpperCase()} data...`);
        await fetchNASAData(dataset, true); // Force refresh
        console.log(`✓ ${dataset.toUpperCase()} data updated\n`);
      } catch (error) {
        console.error(`✗ Error fetching ${dataset} data:`, error.message, '\n');
      }
    }

    // Step 2: Detect new planets from each dataset
    console.log('Step 2: Detecting new planets...\n');

    let totalNewPlanets = 0;

    for (const dataset of datasets) {
      try {
        console.log(`Scanning ${dataset.toUpperCase()} for new planets...`);
        const newPlanets = await detectNewPlanets(dataset);
        totalNewPlanets += newPlanets.length;

        console.log(`Found ${newPlanets.length} new planets in ${dataset.toUpperCase()}`);

        if (newPlanets.length > 0) {
          console.log('New planets discovered:');
          newPlanets.forEach(planet => {
            console.log(`  - ${planet.planet_name} (${planet.classification}, ${(planet.probability * 100).toFixed(1)}% confidence)`);
          });
        }
        console.log('');
      } catch (error) {
        console.error(`✗ Error detecting planets in ${dataset}:`, error.message, '\n');
      }
    }

    // Summary
    console.log('=== Training Complete ===');
    console.log(`Total new planets discovered: ${totalNewPlanets}`);
    console.log('All datasets have been refreshed and analyzed.\n');

  } catch (error) {
    console.error('Training failed:', error);
    process.exit(1);
  }
}

/**
 * Refresh specific dataset
 */
async function refreshDataset(datasetName) {
  console.log(`Refreshing ${datasetName} dataset...`);

  try {
    await fetchNASAData(datasetName, true);
    console.log(`✓ ${datasetName} data refreshed`);

    const newPlanets = await detectNewPlanets(datasetName);
    console.log(`✓ Found ${newPlanets.length} new planets`);

    return newPlanets;
  } catch (error) {
    console.error(`Error refreshing ${datasetName}:`, error);
    throw error;
  }
}

/**
 * Quick update - only check for new planets without full refresh
 */
async function quickUpdate() {
  console.log('Running quick update...\n');

  try {
    const datasets = ['tess'];
    let totalNew = 0;

    for (const dataset of datasets) {
      const newPlanets = await detectNewPlanets(dataset);
      totalNew += newPlanets.length;
      console.log(`${dataset.toUpperCase()}: ${newPlanets.length} new planets`);
    }

    console.log(`\nTotal new planets: ${totalNew}`);
    return totalNew;
  } catch (error) {
    console.error('Quick update failed:', error);
    throw error;
  }
}

// Run training if called directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0] || 'full';

  switch (command) {
    case 'full':
      trainAgent();
      break;
    case 'quick':
      quickUpdate();
      break;
    case 'refresh':
      const dataset = args[1] || 'tess';
      refreshDataset(dataset);
      break;
    default:
      console.log('Usage:');
      console.log('  node train.js full          - Full training with data refresh');
      console.log('  node train.js quick         - Quick update without refresh');
      console.log('  node train.js refresh <dataset> - Refresh specific dataset');
  }
}

module.exports = {
  trainAgent,
  refreshDataset,
  quickUpdate
};
