const { protect } = require('./protect');

function devAuthBypass(devUser) {
  const mockUser = Object.freeze({ ...devUser });

  return (req, res, next) => {
    const bypassEnabled =
      process.env.LOCAL_AUTH_BYPASS === 'true'
      && process.env.NODE_ENV !== 'production';

    if (!bypassEnabled) {
      return protect(req, res, next);
    }

    req.user = mockUser;
    return next();
  };
}

module.exports = { devAuthBypass };
