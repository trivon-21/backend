const authService = require("./auth.service");

exports.login = async (req, res) => {
  try {
    const { email, password, rememberMe, identifier, phoneNumber } = req.body;
    const authInput = identifier || email || phoneNumber;

    if (!authInput || !password) {
      return res.status(400).json({ message: "identifier (email or phone) and password are required" });
    }

    const result = await authService.login(authInput, password, rememberMe !== false);

    return res.json({
      message: "Login successful",
      token: result.token,
      user: result.user
    });
  } catch (err) {
    if (err.message.includes("Account locked")) {
      return res.status(423).json({ message: err.message });
    }
    return res.status(401).json({ message: err.message });
  }
};
