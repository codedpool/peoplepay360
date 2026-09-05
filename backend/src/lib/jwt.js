const jwt = require("jsonwebtoken");
const { env } = require("./env");

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, roles: user.roles, employeeId: user.employeeId ?? null },
    env.jwtAccessSecret,
    { expiresIn: env.jwtAccessTtl }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwtAccessSecret);
}

module.exports = { signAccessToken, verifyAccessToken };
