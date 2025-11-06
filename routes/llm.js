import express from 'express';
import { callLLM, generateSearchQuery } from '../services/llm.js';
import { validateApiKey } from '../middleware/security.js';
import { getCache, setCache, generateCacheKey } from '../services/cache.js';
import axios from 'axios';

const router = express.Router();

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

router.post('/ask', validateApiKey, async (req, res, next) => {
  try {
    const { prompt, location, conversationId, maxResults = 5 } = req.body;

    if (!prompt || !prompt.trim()) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Prompt is required'
      });
    }

    const llmResponse = await callLLM(prompt, conversationId);

    if (!llmResponse.success) {
      return res.status(503).json({
        error: 'LLM service required',
        message: llmResponse.message || 'Open WebUI is required. Make sure it\'s running and configured.',
        details: llmResponse.error,
        suggestion: llmResponse.error === 'LLM service unavailable' && llmResponse.fallback
          ? 'Check: 1) Open WebUI running at http://localhost:8080, 2) OPEN_WEBUI_API_KEY set in .env, 3) Model connected in Open WebUI'
          : 'Ensure Open WebUI is running and accessible.'
      });
    }

    let searchQuery = generateSearchQuery(llmResponse);
    if (!searchQuery) {
      searchQuery = prompt;
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    let results = [];
    let mapsError = null;
    let mapsAvailable = false;

    if (apiKey) {
      const cacheKey = generateCacheKey('places:search', {
        query: searchQuery.toLowerCase().trim(),
        location: location || '',
        maxResults
      });

      const cached = await getCache(cacheKey);
      if (cached && cached.results) {
        console.log('Cache hit for places search');
        results = cached.results;
        mapsAvailable = true;
      } else {
        const url = `${PLACES_API_BASE}/places:searchText`;
        
        const body = {
          textQuery: searchQuery,
          maxResultCount: parseInt(maxResults),
        };

        if (location) {
          const [lat, lng] = location.split(',').map(Number);
          body.locationBias = {
            circle: {
              center: { latitude: lat, longitude: lng },
              radius: '5000.0'
            }
          };
        }

        try {
          const response = await axios.post(url, body, {
            headers: {
              'Content-Type': 'application/json',
              'X-Goog-Api-Key': apiKey,
              'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.priceLevel,places.photos'
            },
            timeout: 10000
          });

          if (response.data?.places) {
            results = response.data.places.slice(0, parseInt(maxResults)).map(place => ({
              place_id: place.id,
              name: place.displayName?.text || 'Unknown',
              formatted_address: place.formattedAddress || '',
              location: {
                lat: place.location?.latitude || 0,
                lng: place.location?.longitude || 0
              },
              rating: place.rating,
              user_ratings_total: place.userRatingCount,
              types: place.types || [],
              price_level: place.priceLevel,
              photos: place.photos?.slice(0, 1).map(photo => ({
                name: photo.name,
                widthPx: photo.widthPx,
                heightPx: photo.heightPx
              })),
              maps_url: `https://www.google.com/maps/place/?q=place_id:${place.id}`,
              embed_url: `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=place_id:${place.id}`
            }));
            mapsAvailable = true;
            
            await setCache(cacheKey, { results }, 86400);
          }
        } catch (error) {
          console.warn('Google Maps API error:', error.response?.data || error.message);
          
          if (error.response) {
            const status = error.response.status;
            const msg = error.response.data?.error?.message;
            
            if (status === 403) {
              let errorMsg = `Google Maps API error (403): ${msg || 'API key invalid or Places API not enabled'}`;
              
              if (msg && msg.includes('has not been used') || msg.includes('disabled')) {
                errorMsg += '\n\nSolusi:\n';
                errorMsg += '1. Pastikan Places API (New) sudah di-enable di Google Cloud Console\n';
                errorMsg += '2. Cek API key restrictions di https://console.cloud.google.com/apis/credentials\n';
                errorMsg += '3. Pastikan "Places API (New)" tercentang di API restrictions\n';
                errorMsg += '4. Tunggu 2-5 menit setelah enable API (propagation time)';
              }
              
              mapsError = errorMsg;
            } else if (status === 400) {
              mapsError = `Google Maps API error (400): ${msg || 'Invalid request'}`;
            } else if (status === 401) {
              mapsError = `Google Maps API error (401): ${msg || 'API key invalid or expired'}`;
            } else {
              mapsError = `Google Maps API error (${status}): ${msg || error.message}`;
            }
          } else {
            mapsError = `Google Maps API error: ${error.message}`;
          }
        }
      }
    } else {
      mapsError = 'Google Maps API key not configured. Showing LLM recommendations only.';
    }

    res.json({
      status: 'success',
      places: {
        query: searchQuery,
        results_count: results.length,
        results: results,
        google_maps_available: mapsAvailable,
        ...(mapsError && { 
          google_maps_error: mapsError,
          note: 'Showing LLM recommendations only. Google Maps unavailable.'
        })
      },
      llm_response: {
        text: llmResponse.text,
        model: llmResponse.model,
        extracted_query: searchQuery,
        conversation_id: llmResponse.conversationId
      }
    });

  } catch (error) {
    next(error);
  }
});

router.get('/health', async (req, res) => {
  try {
    const baseUrl = process.env.OPEN_WEBUI_BASE_URL || 'http://localhost:8080';
    const apiKey = process.env.OPEN_WEBUI_API_KEY || '';
    
    const headers = { 'Content-Type': 'application/json' };
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }
    
    try {
      const response = await axios.get(`${baseUrl}/api/v1/models`, { 
        headers,
        timeout: 5000 
      });
      
      res.json({
        status: 'connected',
        llm_service: 'Open WebUI',
        url: baseUrl,
        models_available: response.data?.data?.length || 0
      });
    } catch (error) {
      const isAuthError = error.response?.status === 401;
      const msg = isAuthError
        ? 'Open WebUI requires authentication. Set OPEN_WEBUI_API_KEY in .env'
        : error.message;
      
      res.status(503).json({
        status: 'disconnected',
        llm_service: 'Open WebUI',
        url: baseUrl,
        error: msg,
        message: isAuthError 
          ? 'Open WebUI requires authentication. Set OPEN_WEBUI_API_KEY in .env'
          : 'Open WebUI not accessible. Ensure it\'s running.'
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

export { router as llmRouter };
