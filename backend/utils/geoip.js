// IP Geolocation utility using ip-api.com (free, no API key required)
// Rate limit: 45 requests per minute for free tier

const cache = new Map();
const CACHE_TTL = 3600000; // 1 hour

// Parse user agent to extract device type and browser
const parseUserAgent = (userAgent) => {
  if (!userAgent) return { deviceType: 'unknown', browser: 'unknown' };

  const ua = userAgent.toLowerCase();

  // Detect device type
  let deviceType = 'desktop';
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) {
    deviceType = 'mobile';
  } else if (/tablet|ipad/i.test(ua)) {
    deviceType = 'tablet';
  } else if (/bot|crawler|spider|scraper/i.test(ua)) {
    deviceType = 'bot';
  }

  // Detect browser
  let browser = 'unknown';
  if (/telegram/i.test(ua)) {
    browser = 'Telegram';
  } else if (/edg/i.test(ua)) {
    browser = 'Edge';
  } else if (/chrome/i.test(ua) && !/chromium/i.test(ua)) {
    browser = 'Chrome';
  } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
    browser = 'Safari';
  } else if (/firefox/i.test(ua)) {
    browser = 'Firefox';
  } else if (/opera|opr/i.test(ua)) {
    browser = 'Opera';
  } else if (/msie|trident/i.test(ua)) {
    browser = 'IE';
  }

  return { deviceType, browser };
};

// Get geolocation data for an IP address
const getGeoData = async (ip) => {
  // Skip private/local IPs
  if (!ip || ip === 'unknown' || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.') || ip.startsWith('172.')) {
    return { country: 'Local', city: 'Local' };
  }

  // Clean IP (remove IPv6 prefix if present)
  const cleanIp = ip.replace(/^::ffff:/, '');

  // Check cache
  const cached = cache.get(cleanIp);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const response = await fetch(`http://ip-api.com/json/${cleanIp}?fields=status,country,city`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return { country: 'Unknown', city: 'Unknown' };
    }

    const data = await response.json();

    if (data.status === 'success') {
      const result = {
        country: data.country || 'Unknown',
        city: data.city || 'Unknown'
      };

      // Cache the result
      cache.set(cleanIp, { data: result, timestamp: Date.now() });

      return result;
    }

    return { country: 'Unknown', city: 'Unknown' };
  } catch (error) {
    // Don't log abort errors (timeout)
    if (error.name !== 'AbortError') {
      console.error('Geolocation error:', error.message);
    }
    return { country: 'Unknown', city: 'Unknown' };
  }
};

// Get full tracking data (geolocation + device/browser)
const getTrackingData = async (ip, userAgent) => {
  const [geoData, deviceData] = await Promise.all([
    getGeoData(ip),
    Promise.resolve(parseUserAgent(userAgent))
  ]);

  return {
    ...geoData,
    ...deviceData
  };
};

// Clean old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      cache.delete(key);
    }
  }
}, 300000); // Clean every 5 minutes

module.exports = {
  parseUserAgent,
  getGeoData,
  getTrackingData
};
