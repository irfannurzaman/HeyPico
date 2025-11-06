import express from 'express';
import axios from 'axios';
import { validateApiKey, trackUsage, checkDailyLimit } from '../middleware/security.js';
import { validatePlaceSearch } from '../middleware/validation.js';
import { getCache, setCache, generateCacheKey } from '../services/cache.js';

const router = express.Router();

const PLACES_API_BASE = 'https://places.googleapis.com/v1';

router.get('/search', validateApiKey, validatePlaceSearch, async (req, res, next) => {
  try {
    const { query, location, radius = 5000, maxResults = 5 } = req.query;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    const cacheKey = generateCacheKey('places:search', {
      query: query.toLowerCase().trim(),
      location: location || '',
      radius,
      maxResults
    });

    const cached = await getCache(cacheKey);
    if (cached) {
      console.log('Cache hit:', cacheKey);
      return res.json(cached);
    }

    const limitCheck = await checkDailyLimit();
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: 'Daily API limit reached',
        message: limitCheck.message
      });
    }

    const url = `${PLACES_API_BASE}/places:searchText`;
    const body = {
      textQuery: query,
      maxResultCount: parseInt(maxResults),
    };

    if (location) {
      const [lat, lng] = location.split(',').map(Number);
      body.locationBias = {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: `${parseInt(radius)}.0`
        }
      };
    }

    const response = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.types,places.priceLevel,places.photos'
      },
      timeout: 10000
    });

    if (!response.data?.places) {
      throw new Error('Invalid response from Google Places API');
    }

    const results = response.data.places.slice(0, parseInt(maxResults)).map(place => ({
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

    const responseData = {
      status: 'success',
      query: query,
      results_count: results.length,
      results: results
    };

    await setCache(cacheKey, responseData, 86400);
    await trackUsage('places_search', 1);

    res.json(responseData);

  } catch (error) {
    next(error);
  }
});

router.get('/details/:placeId', validateApiKey, async (req, res, next) => {
  try {
    const { placeId } = req.params;
    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    const cacheKey = generateCacheKey('places:details', { placeId });

    const cached = await getCache(cacheKey);
    if (cached) {
      console.log('Cache hit:', cacheKey);
      return res.json(cached);
    }

    const limitCheck = await checkDailyLimit();
    if (!limitCheck.allowed) {
      return res.status(429).json({
        error: 'Daily API limit reached',
        message: limitCheck.message
      });
    }

    const url = `${PLACES_API_BASE}/places/${placeId}`;
    const response = await axios.get(url, {
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'id,displayName,formattedAddress,location,rating,userRatingCount,nationalPhoneNumber,website,regularOpeningHours,types,priceLevel,photos,reviews'
      },
      timeout: 10000
    });

    if (!response.data) {
      throw new Error('Invalid response from Google Places API');
    }

    const place = response.data;
    const result = {
      place_id: place.id,
      name: place.displayName?.text || 'Unknown',
      formatted_address: place.formattedAddress || '',
      location: {
        lat: place.location?.latitude || 0,
        lng: place.location?.longitude || 0
      },
      rating: place.rating,
      user_ratings_total: place.userRatingCount,
      formatted_phone_number: place.nationalPhoneNumber || '',
      website: place.website || '',
      opening_hours: place.regularOpeningHours ? {
        openNow: place.regularOpeningHours.openNow,
        weekdayDescriptions: place.regularOpeningHours.weekdayDescriptions || []
      } : null,
      types: place.types || [],
      price_level: place.priceLevel,
      photos: place.photos?.slice(0, 3).map(photo => ({
        name: photo.name,
        widthPx: photo.widthPx,
        heightPx: photo.heightPx,
        url: `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=400&key=${apiKey}`
      })),
      reviews: place.reviews?.slice(0, 5).map(review => ({
        author: review.authorAttribution?.displayName || 'Anonymous',
        rating: review.rating,
        text: review.text?.text || '',
        time: review.publishTime || ''
      })),
      maps_url: `https://www.google.com/maps/place/?q=place_id:${place.id}`,
      embed_url: `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=place_id:${place.id}`
    };

    const responseData = {
      status: 'success',
      result: result
    };

    await setCache(cacheKey, responseData, 604800);
    await trackUsage('places_details', 1);

    res.json(responseData);

  } catch (error) {
    next(error);
  }
});

export { router as placesRouter };
