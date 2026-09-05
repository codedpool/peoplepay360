const bcrypt = require("bcryptjs");
const { env } = require("./env");

function hashPassword(password) {
  return bcrypt.hash(password, env.bcryptCost);
}

function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

module.exports = { hashPassword, verifyPassword };
