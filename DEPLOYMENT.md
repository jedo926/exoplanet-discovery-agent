# Deployment Guide - CosmicAI Exoplanet Discovery

## Quick Deploy Options

### Option 1: Render.com (Recommended - FREE)

**Best for: Quick deployment, free tier, supports Python + Node.js**

1. **Sign up**: Go to https://render.com and create an account
2. **New Blueprint**: Click "New" → "Blueprint"
3. **Connect GitHub**: Authorize Render to access your repo
4. **Select repo**: Choose `exoplanet-discovery-agent`
5. **Deploy**: Render will automatically detect `render.yaml` and deploy both services

**Set Environment Variables** in Render Dashboard:
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_KEY`: Your Supabase anon key
- `PORT`: 3000 (for main app), 5001 (for ML API)

**URL**: Your app will be at `https://exoplanet-discovery.onrender.com`

⚠️ **Important**: The ML model files (*.pkl) are NOT in the repo (too large). You need to:
1. Upload `exoplanet_classifier.pkl` and `feature_scaler.pkl` to cloud storage (Google Drive, Dropbox)
2. Add a build script to download them during deployment
3. OR: Train the model on Render (will take time on first deploy)

---

### Option 2: Railway (FREE, Easy)

1. Go to https://railway.app
2. Click "Start a New Project"
3. Select "Deploy from GitHub repo"
4. Choose your repo
5. Add environment variables
6. Deploy!

**Pros**: Automatic HTTPS, easy setup
**Cons**: Need to handle ML model files separately

---

### Option 3: Vercel + Heroku (Hybrid)

**Frontend (Vercel - Free)**
- Deploy static frontend to Vercel
- Point API calls to Heroku backend

**Backend (Heroku - Free tier available)**
```bash
heroku create exoplanet-discovery
heroku addons:create heroku-postgresql:mini
git push heroku main
```

---

### Option 4: DigitalOcean App Platform ($5/month)

1. Go to https://cloud.digitalocean.com/apps
2. Create New App from GitHub
3. Select your repo
4. Configure:
   - Web Service: Node.js (port 3000)
   - Worker: Python ML API (port 5001)
5. Add environment variables
6. Deploy

**Pros**: Full control, good for production
**Cons**: Not free ($5/month minimum)

---

### Option 5: AWS EC2 (Free Tier - 12 months)

**For experienced users**

1. Launch EC2 instance (t2.micro - free tier)
2. SSH into instance
3. Install Node.js, Python, git
4. Clone repo
5. Install dependencies
6. Run with PM2:
```bash
pm2 start server.js
pm2 start ml_model/predict_api.py --interpreter python3
```

---

## Easiest for Hackathon Demo

### **Option: Render.com (5 minutes)**

Just push your code and it auto-deploys! No manual setup needed.

```bash
git add render.yaml DEPLOYMENT.md
git commit -m "Add deployment configuration"
git push origin main
```

Then:
1. Go to https://render.com
2. New Blueprint → Select your repo
3. Done! ✅

**Live URL**: `https://exoplanet-discovery.onrender.com`

---

## Local Demo (No deployment needed)

If deployment is taking too long, just demo locally:

```bash
# Terminal 1: Start ML API
cd ml_model && python3 predict_api.py

# Terminal 2: Start Node server
npm start

# Open browser
http://localhost:3000
```

**Tip for demo**: Use ngrok for temporary public URL:
```bash
ngrok http 3000
# Share the ngrok URL (https://xxx.ngrok.io)
```

---

## Post-Deployment Checklist

- [ ] Update `ML_API_URL` in `backend/agent.js` if ML API is on different service
- [ ] Set environment variables (SUPABASE_URL, SUPABASE_KEY)
- [ ] Upload ML model files or train on deployment
- [ ] Test file upload works
- [ ] Test planet detection works
- [ ] Test phase-folded plot displays
- [ ] Check database connection

---

## Troubleshooting

**ML API not connecting**
- Check `ML_API_URL` in `backend/agent.js`
- Ensure Python service is running
- Check model files exist in `ml_model/` directory

**Database errors**
- Verify Supabase credentials in environment variables
- Check Supabase project is active
- Ensure `discoveries` table exists

**File upload fails**
- Check `uploads/` directory is writable
- Verify file size limit (50MB)
- Check CORS settings

---

## Production Recommendations

1. **Use CDN** for static assets (Cloudflare, CloudFront)
2. **Add monitoring** (Sentry, LogRocket)
3. **Enable caching** for ML predictions
4. **Add rate limiting** to prevent abuse
5. **Use Git LFS** for model files
6. **Set up CI/CD** (GitHub Actions)
7. **Add health checks** for services
8. **Use environment-specific configs**

Good luck with your hackathon! 🚀
