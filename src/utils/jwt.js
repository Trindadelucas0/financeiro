const jwt = require('jsonwebtoken');
const { loadEnv } = require('../config/env');

function signToken(payload) {
  const { jwt: jwtConfig } = loadEnv();
  return jwt.sign(payload, jwtConfig.secret, { expiresIn: jwtConfig.expiresIn });
}

function verifyToken(token) {
  const { jwt: jwtConfig } = loadEnv();
  return jwt.verify(token, jwtConfig.secret);
}

module.exports = { signToken, verifyToken };
