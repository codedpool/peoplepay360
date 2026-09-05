const jwt = require("jsonwebtoken");
const { env } = require("./env");

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      employeeId: user.employeeId ?? null,
      // Carried in the token so requireAuth can gate every request without a
      // per-request user lookup. The flag is cleared by issuing a fresh token
      // the moment the password is changed, so a stale "must change" claim
      // lives at most until the caller's next refresh either way.
      mustChangePassword: user.mustChangePassword === true,
    },
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessTtl }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

module.exports = { signAccessToken, verifyAccessToken };
