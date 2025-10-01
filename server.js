require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

const {
  analyzeLightCurve,
  getAllPlanets,
  getMLModelStats
} = require('./backend/agent');

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
 * Get ML model statistics
 */
app.get('/api/ml-stats', async (req, res) => {
  try {
    const stats = await getMLModelStats();

    if (!stats) {
      return res.status(503).json({
        success: false,
        error: 'ML model not available'
      });
    }

    res.json({
      success: true,
      stats: stats
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
  console.log(`  GET  /api/ml-stats      - Get ML model statistics`);
  console.log(``);

  // Server ready - no automatic scanning
  console.log(`✨ Ready! Visit http://localhost:${PORT} to discover planets.\n`);
});

module.exports = app;
