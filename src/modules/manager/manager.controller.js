const service = require("./manager.service");

exports.toString = (req, res) => {
  res.json({ message: "Manager module placeholder" });
};
