function validateRuntime(env = process.env) {
  if (!env.JWT_SECRET || env.JWT_SECRET.trim().length < 32) {
    throw new Error('JWT_SECRET must contain at least 32 characters.');
  }
  if (!env.MONGO_DB_NAME || !/^[a-zA-Z0-9_-]+$/.test(env.MONGO_DB_NAME)) {
    throw new Error('Set an explicit MONGO_DB_NAME using letters, numbers, underscores or hyphens.');
  }
  if (env.DEMO_MODE === 'true' && !env.MONGO_DB_NAME.startsWith('airlux_demo')) {
    throw new Error('DEMO_MODE requires a database name starting with airlux_demo.');
  }
  if (env.NODE_ENV === 'production') {
    if (!env.MONGO_URI && !env.MONGODB_URI) throw new Error('Production requires MONGO_URI or MONGODB_URI.');
    const origins = (env.FRONTEND_URL || '').split(',').map(value => value.trim()).filter(Boolean);
    if (!origins.length || origins.some(origin => {
      try { const url = new URL(origin); return url.protocol !== 'https:' || url.origin !== origin; }
      catch { return true; }
    })) throw new Error('Production requires FRONTEND_URL with explicit HTTPS origins.');
  }
}
function jobsEnabled(env = process.env) {
  return env.DEMO_MODE !== 'true' && env.NODE_ENV !== 'test' && env.BACKGROUND_JOBS_ENABLED === 'true';
}
module.exports = { validateRuntime, jobsEnabled };
