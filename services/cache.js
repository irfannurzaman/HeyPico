import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let redis = null;
let redisConnected = false;

try {
  redis = new Redis(redisUrl, {
    retryStrategy: (times) => {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableReadyCheck: true
  });

  redis.on('error', (err) => {
    console.error('Redis connection error:', err.message);
    redisConnected = false;
    throw new Error(`Redis connection failed: ${err.message}`);
  });

  redis.on('connect', () => {
    console.log('Redis connected');
    redisConnected = true;
  });

  redis.on('ready', () => {
    console.log('Redis ready');
    redisConnected = true;
  });

  redis.on('close', () => {
    console.error('Redis connection closed');
    redisConnected = false;
  });
} catch (error) {
  console.error('Redis initialization error:', error.message);
  throw new Error(`Redis is required but not available: ${error.message}`);
}

export async function connectRedis() {
  if (!redis) {
    throw new Error('Redis is required but not initialized');
  }
  
  try {
    await redis.connect();
    redisConnected = true;
    return true;
  } catch (error) {
    throw new Error(`Redis connection failed: ${error.message}`);
  }
}

export async function getCache(key) {
  if (!redis) {
    throw new Error('Redis is required but not available');
  }
  
  if (!redisConnected) {
    throw new Error('Redis is not connected');
  }
  
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    throw new Error(`Cache get error: ${error.message}`);
  }
}

export async function setCache(key, value, ttlSeconds = 86400) {
  if (!redis) {
    throw new Error('Redis is required but not available');
  }
  
  if (!redisConnected) {
    throw new Error('Redis is not connected');
  }
  
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
    return true;
  } catch (error) {
    throw new Error(`Cache set error: ${error.message}`);
  }
}

export function generateCacheKey(prefix, params) {
  const sorted = Object.keys(params)
    .sort()
    .map(k => `${k}:${params[k]}`)
    .join('|');
  return `heypico:${prefix}:${sorted}`;
}

export async function clearCache(pattern) {
  if (!redis) {
    throw new Error('Redis is required but not available');
  }
  
  if (!redisConnected) {
    throw new Error('Redis is not connected');
  }
  
  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  } catch (error) {
    throw new Error(`Cache clear error: ${error.message}`);
  }
}

export function isRedisConnected() {
  return redisConnected && redis !== null;
}

