const dashboardService = require("./dashboard.service");

exports.getDashboard = async (req, res) => {
  try {
    const dashboard = await dashboardService.getDashboard(req.user._id);
    return res.json({ data: dashboard });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
