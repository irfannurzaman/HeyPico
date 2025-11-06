export function validatePlaceSearch(req, res, next) {
  const { query } = req.query;

  if (!query || !query.trim()) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Query parameter is required'
    });
  }

  if (query.length > 200) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Query parameter is too long (max 200 characters)'
    });
  }

  if (req.query.location) {
    const locationPattern = /^-?\d+\.?\d*,-?\d+\.?\d*$/;
    if (!locationPattern.test(req.query.location)) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Location must be in format: lat,lng (e.g., 37.7749,-122.4194)'
      });
    }
  }

  if (req.query.radius) {
    const radius = parseInt(req.query.radius);
    if (isNaN(radius) || radius < 0 || radius > 50000) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Radius must be a number between 0 and 50000 meters'
      });
    }
  }

  next();
}
