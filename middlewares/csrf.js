const { doubleCsrf } = require("csrf-csrf");

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => process.env.JWT_SECRET || "csrf-secret",
  cookieName: process.env.NODE_ENV === "production" ? "__Host-psifi.x-csrf-token" : "x-csrf-token",
  cookieOptions: {
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    signed: false,
    httpOnly: true,
  },
  size: 64,
  getTokenFromRequest: (req) =>
    req.body?._csrf || req.query?._csrf || req.headers?.["x-csrf-token"],
});

module.exports = {
  generateToken,
  doubleCsrfProtection,
};

