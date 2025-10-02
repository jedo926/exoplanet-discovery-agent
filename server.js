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

// Helper function to convert JSON to CSV
function convertJsonToCSV(data) {
  // Handle array of objects
  if (Array.isArray(data)) {
    if (data.length === 0) throw new Error('Empty JSON array');

    const headers = Object.keys(data[0]);
    const rows = data.map(obj => headers.map(h => obj[h] ?? '').join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  // Handle nested object with arrays
  const findArrays = (obj, path = []) => {
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'object') {
        return value;
      }
      if (typeof value === 'object' && value !== null) {
        const result = findArrays(value, [...path, key]);
        if (result) return result;
      }
    }
    return null;
  };

  const arrayData = findArrays(data);
  if (arrayData) {
    const headers = Object.keys(arrayData[0]);
    const rows = arrayData.map(obj => headers.map(h => obj[h] ?? '').join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  throw new Error('Could not find tabular data in JSON');
}

// Helper function to convert XML to CSV
function convertXmlToCSV(xmlObj) {
  // Try to find array-like structures in XML
  const findArrays = (obj) => {
    if (Array.isArray(obj)) return obj;

    for (const value of Object.values(obj)) {
      if (Array.isArray(value) && value.length > 0) {
        return value;
      }
      if (typeof value === 'object' && value !== null) {
        const result = findArrays(value);
        if (result) return result;
      }
    }
    return null;
  };

  const arrayData = findArrays(xmlObj);
  if (!arrayData) throw new Error('Could not find tabular data in XML');

  // Flatten nested objects
  const flattenObject = (obj, prefix = '') => {
    const flattened = {};
    for (const [key, value] of Object.entries(obj)) {
      if (Array.isArray(value)) {
        flattened[prefix + key] = value[0];
      } else if (typeof value === 'object' && value !== null) {
        Object.assign(flattened, flattenObject(value, prefix + key + '_'));
      } else {
        flattened[prefix + key] = value;
      }
    }
    return flattened;
  };

  const flatData = arrayData.map(item => flattenObject(item));
  const headers = Object.keys(flatData[0]);
  const rows = flatData.map(obj => headers.map(h => obj[h] ?? '').join(','));

  return [headers.join(','), ...rows].join('\n');
}

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
    const allowed = ['.csv', '.tsv', '.txt', '.fits', '.fit', '.dat', '.lc', '.xls', '.xlsx', '.xml', '.json', '.tbl', '.ascii'];
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('File format not supported. Accepted: CSV, TSV, TXT, FITS, DAT, LC, XLS, XLSX, XML, JSON, TBL, ASCII'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit
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

    let ticId = req.body.ticId || null;
    let fileContent;

    // Check file format and convert to CSV
    const filename = req.file.originalname.toLowerCase();
    const isFits = filename.match(/\.(fits|fit)$/);
    const isExcel = filename.match(/\.(xls|xlsx)$/);
    const isXml = filename.match(/\.xml$/);
    const isJson = filename.match(/\.json$/);

    if (isFits) {
      // Convert FITS to CSV using Python script
      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      try {
        const scriptPath = path.join(__dirname, 'ml_model/convert_fits.py');
        const { stdout } = await execAsync(`python3 "${scriptPath}" "${req.file.path}"`);
        fileContent = stdout;
        console.log(`Converted FITS file: ${req.file.originalname}`);
      } catch (conversionError) {
        throw new Error(`FITS conversion failed: ${conversionError.message}`);
      }
    } else if (isExcel) {
      // Convert Excel to CSV using xlsx library
      const XLSX = require('xlsx');

      try {
        const workbook = XLSX.readFile(req.file.path);
        const sheetName = workbook.SheetNames[0]; // Use first sheet
        const worksheet = workbook.Sheets[sheetName];
        fileContent = XLSX.utils.sheet_to_csv(worksheet);
        console.log(`Converted Excel file: ${req.file.originalname}`);
      } catch (conversionError) {
        throw new Error(`Excel conversion failed: ${conversionError.message}`);
      }
    } else if (isXml) {
      // Convert XML to CSV - try to extract tabular data
      const xml2js = require('xml2js');
      const parser = new xml2js.Parser();

      try {
        const xmlContent = await fs.readFile(req.file.path, 'utf-8');
        const result = await parser.parseStringPromise(xmlContent);

        // Try to find array-like structures and convert to CSV
        fileContent = convertXmlToCSV(result);
        console.log(`Converted XML file: ${req.file.originalname}`);
      } catch (conversionError) {
        throw new Error(`XML parsing failed: ${conversionError.message}`);
      }
    } else if (isJson) {
      // Convert JSON to CSV
      try {
        const jsonContent = await fs.readFile(req.file.path, 'utf-8');
        const data = JSON.parse(jsonContent);

        fileContent = convertJsonToCSV(data);
        console.log(`Converted JSON file: ${req.file.originalname}`);
      } catch (conversionError) {
        throw new Error(`JSON parsing failed: ${conversionError.message}`);
      }
    } else {
      // Read as text file (CSV, TXT, etc.)
      fileContent = await fs.readFile(req.file.path, 'utf-8');
    }

    // Try to extract TIC ID from CSV headers/comments if not already set
    if (!ticId && fileContent) {
      const lines = fileContent.split('\n').slice(0, 50); // Check first 50 lines
      for (const line of lines) {
        // Look for TIC ID in comments like: # TIC ID: 50365310 or TICID=50365310
        const ticMatch = line.match(/(?:TIC\s*ID|TICID|TIC)[\s:=]+(\d+)/i);
        if (ticMatch) {
          ticId = ticMatch[1];
          console.log(`Extracted TIC ID from file metadata: ${ticId}`);
          break;
        }
      }
    }

    // Analyze the light curve
    const result = await analyzeLightCurve(fileContent, ticId);

    // Clean up uploaded file
    await fs.unlink(req.file.path).catch(err => console.error('Error deleting file:', err));

    // Return the new multi-planet format
    res.json({
      success: true,
      result: result  // Now returns: { planets: [], totalDetected, storedCount, hostStar, hostStarInfo, message }
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
