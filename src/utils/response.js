const success = (res, data, message = 'OK', status = 200) => {
  return res.status(status).json({ success: true, message, data });
};

const failure = (res, error, status = 500) => {
  return res.status(status).json({ success: false, error });
};

module.exports = {
  success,
  failure
};
