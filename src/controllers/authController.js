const authService = require('../services/authService');

async function login(req, res, next) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email e password são obrigatórios' });
    }
    const result = await authService.login(email, password);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const user = await authService.getMe(req.user.id);
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

module.exports = { login, me };
