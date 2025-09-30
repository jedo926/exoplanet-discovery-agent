const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const {
  analyzeLightCurve,
  getAllPlanets,
  detectNewPlanets,
  fetchNASAData,
  autoScanOnStartup
} = require('./backend/agent');

const { trainAgent, quickUpdate } = require('./backend/train');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('frontend'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    await fs.mkdir(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.csv' || ext === '.tsv' || ext === '.txt') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, TSV, and TXT files are allowed'));
    }
  },
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Routes

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    message: 'Exoplanet Discovery Agent is running',
    timestamp: new Date().toISOString()
  });
});

/**
 * Analyze uploaded CSV light curve
 */
app.post('/api/analyze', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const ticId = req.body.ticId || null;

    // Read uploaded file
    const fileContent = await fs.readFile(req.file.path, 'utf-8');

    // Analyze the light curve
    const result = await analyzeLightCurve(fileContent, ticId);

    // Clean up uploaded file
    await fs.unlink(req.file.path).catch(err => console.error('Error deleting file:', err));

    res.json({
      success: true,
      result: {
        classification: result.classification,
        probability: result.probability,
        reasoning: result.reasoning,
        features: result.features,
        plotData: result.plotData,
        stored: result.stored
      }
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Analysis failed'
    });
  }
});

/**
 * Analyze by TIC/KOI ID (fetch from NASA)
 */
app.post('/api/analyze-id', async (req, res) => {
  try {
    const { id, dataset } = req.body;

    if (!id) {
      return res.status(400).json({ error: 'ID is required' });
    }

    // This is a simplified version - in production you'd fetch specific light curve data
    res.status(501).json({
      error: 'Direct TIC/KOI ID analysis not yet implemented',
      message: 'Please upload a CSV file instead'
    });
  } catch (error) {
    console.error('Analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Get all discovered planets
 */
app.get('/api/planets', async (req, res) => {
  try {
    const planets = await getAllPlanets();

    res.json({
      success: true,
      count: planets.length,
      planets: planets
    });
  } catch (error) {
    console.error('Error fetching planets:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch planets'
    });
  }
});

/**
 * Detect new planets from NASA data
 */
app.post('/api/detect-new', async (req, res) => {
  try {
    const { dataset } = req.body;
    const targetDataset = dataset || 'tess';

    const newPlanets = await detectNewPlanets(targetDataset);

    res.json({
      success: true,
      dataset: targetDataset,
      count: newPlanets.length,
      planets: newPlanets
    });
  } catch (error) {
    console.error('Detection error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Detection failed'
    });
  }
});

/**
 * Train/refresh the agent
 */
app.post('/api/train', async (req, res) => {
  try {
    const { mode } = req.body;

    // Run training in background
    if (mode === 'quick') {
      quickUpdate()
        .then(() => console.log('Quick update completed'))
        .catch(err => console.error('Quick update error:', err));

      res.json({
        success: true,
        message: 'Quick update started in background'
      });
    } else {
      trainAgent()
        .then(() => console.log('Full training completed'))
        .catch(err => console.error('Training error:', err));

      res.json({
        success: true,
        message: 'Full training started in background'
      });
    }
  } catch (error) {
    console.error('Training error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Training failed'
    });
  }
});

/**
 * Get NASA dataset info
 */
app.get('/api/datasets', async (req, res) => {
  try {
    const datasets = [
      {
        name: 'TESS',
        description: 'Transiting Exoplanet Survey Satellite',
        url: 'https://exoplanetarchive.ipac.caltech.edu'
      },
      {
        name: 'Kepler',
        description: 'Kepler Space Telescope',
        url: 'https://exoplanetarchive.ipac.caltech.edu'
      },
      {
        name: 'K2',
        description: 'K2 Mission',
        url: 'https://exoplanetarchive.ipac.caltech.edu'
      }
    ];

    res.json({
      success: true,
      datasets: datasets
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Serve frontend
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'frontend', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Start server
app.listen(PORT, async () => {
  console.log(`\n🚀 Exoplanet Discovery Agent Server`);
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`🔬 Ready to discover exoplanets!\n`);
  console.log(`Endpoints:`);
  console.log(`  POST /api/analyze       - Analyze light curve CSV`);
  console.log(`  GET  /api/planets       - Get all discovered planets`);
  console.log(`  POST /api/detect-new    - Detect new planets from NASA`);
  console.log(`  POST /api/train         - Train/refresh agent`);
  console.log(``);

  // Auto-scan NASA databases for transit planets on startup
  console.log('🌠 Initiating automatic NASA database scan for transit method planets...\n');

  // Run auto-scan in background (non-blocking)
  autoScanOnStartup()
    .then((count) => {
      console.log(`✨ Startup scan completed! ${count} new transit planets added to database.`);
      console.log(`Visit http://localhost:${PORT} to view discovered planets.\n`);
    })
    .catch((error) => {
      console.error('⚠️  Startup scan encountered an error:', error.message);
      console.log('Server is still running. You can manually trigger scans via the web interface.\n');
    });
});

module.exports = app;
