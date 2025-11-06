import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USAGE_FILE = path.join(__dirname, '../data/usage.json');
const DAILY_LIMIT = parseInt(process.env.GOOGLE_MAPS_DAILY_LIMIT) || 1000;

async function ensureDataDir() {
  const dataDir = path.dirname(USAGE_FILE);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

async function initUsageTracking() {
  await ensureDataDir();
  try {
    await fs.access(USAGE_FILE);
  } catch {
    await fs.writeFile(USAGE_FILE, JSON.stringify({
      daily: {},
      total: 0
    }, null, 2));
  }
}

function getTodayKey() {
  return new Date().toISOString().split('T')[0];
}

async function readUsage() {
  await ensureDataDir();
  try {
    const data = await fs.readFile(USAGE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    return { daily: {}, total: 0 };
  }
}

async function writeUsage(data) {
  await ensureDataDir();
  await fs.writeFile(USAGE_FILE, JSON.stringify(data, null, 2));
}

export function validateApiKey(req, res, next) {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    return res.status(500).json({
      error: 'Google Maps API key not configured',
      message: 'Please set GOOGLE_MAPS_API_KEY in your environment variables'
    });
  }
  next();
}

export async function trackUsage(endpoint, count = 1) {
  try {
    await initUsageTracking();
    const usage = await readUsage();
    const today = getTodayKey();

    if (!usage.daily[today]) {
      usage.daily[today] = { count: 0, endpoints: {} };
    }

    usage.daily[today].count += count;
    usage.daily[today].endpoints[endpoint] = (usage.daily[today].endpoints[endpoint] || 0) + count;
    usage.total += count;

    // Clean up old entries (keep last 30 days)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffKey = cutoff.toISOString().split('T')[0];
    
    Object.keys(usage.daily).forEach(date => {
      if (date < cutoffKey) {
        delete usage.daily[date];
      }
    });

    await writeUsage(usage);
  } catch (error) {
    console.error('Error tracking usage:', error);
  }
}

export async function checkDailyLimit() {
  try {
    await initUsageTracking();
    const usage = await readUsage();
    const today = getTodayKey();
    const todayUsage = usage.daily[today]?.count || 0;

    if (todayUsage >= DAILY_LIMIT) {
      return {
        allowed: false,
        message: `Daily API limit of ${DAILY_LIMIT} requests reached. Current usage: ${todayUsage}`
      };
    }

    return {
      allowed: true,
      remaining: DAILY_LIMIT - todayUsage,
      used: todayUsage,
      limit: DAILY_LIMIT
    };
  } catch (error) {
    console.error('Error checking daily limit:', error);
    return { allowed: true }; // Fail open
  }
}

export async function getUsageStats() {
  try {
    await initUsageTracking();
    const usage = await readUsage();
    const today = getTodayKey();
    const todayUsage = usage.daily[today] || { count: 0, endpoints: {} };

    return {
      today: {
        date: today,
        count: todayUsage.count,
        endpoints: todayUsage.endpoints,
        remaining: Math.max(0, DAILY_LIMIT - todayUsage.count),
        limit: DAILY_LIMIT
      },
      total: usage.total,
      daily_history: Object.keys(usage.daily)
        .sort()
        .slice(-7)
        .map(date => ({
          date,
          count: usage.daily[date].count
        }))
    };
  } catch (error) {
    console.error('Error getting usage stats:', error);
    return {
      today: { count: 0, remaining: DAILY_LIMIT, limit: DAILY_LIMIT },
      total: 0,
      daily_history: []
    };
  }
}

// Initialize on load
initUsageTracking().catch(console.error);
