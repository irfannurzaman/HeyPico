import express from 'express';
import { validateApiKey } from '../middleware/security.js';

const router = express.Router();

router.get('/embed', validateApiKey, (req, res) => {
  try {
    const { lat, lng, zoom = 15, place_id } = req.query;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Google Maps API key not configured' });
    }

    let embedUrl;
    if (place_id) {
      embedUrl = `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=place_id:${place_id}`;
    } else if (lat && lng) {
      embedUrl = `https://www.google.com/maps/embed/v1/view?key=${apiKey}&center=${lat},${lng}&zoom=${zoom}`;
    } else {
      return res.status(400).json({ error: 'Either place_id or lat/lng must be provided' });
    }

    res.json({
      status: 'success',
      embed_url: embedUrl,
      maps_url: place_id 
        ? `https://www.google.com/maps/place/?q=place_id:${place_id}`
        : `https://www.google.com/maps/@${lat},${lng},${zoom}z`
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/directions', validateApiKey, (req, res) => {
  try {
    const { origin, destination, mode = 'driving' } = req.query;

    if (!origin || !destination) {
      return res.status(400).json({ error: 'Origin and destination are required' });
    }

    const directionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${mode}`;

    res.json({
      status: 'success',
      directions_url: directionsUrl
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export { router as mapsRouter };
