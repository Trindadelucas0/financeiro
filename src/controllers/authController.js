const authService = require('../services/authService');
const profileController = require('./profileController');

async function register(req, res, next) {
  try {
    const { nome, email, password, username } = req.body;
    if (!nome || !email || !password) {
      return res.status(400).json({ error: 'nome, email e password são obrigatórios' });
    }
    const result = await authService.register({ nome, email, password, username });
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

async function login(req, res, next) {
  try {
    const { identifier, email, password } = req.body;
    const loginId = identifier || email;
    if (!loginId || !password) {
      return res.status(400).json({ error: 'identifier e password são obrigatórios' });
    }
    const result = await authService.login(loginId, password);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function me(req, res, next) {
  try {
    const result = await authService.getMe(req.user.id);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function verifyPassword(req, res, next) {
  try {
    const { password } = req.body;
    const result = await authService.verifyPassword(req.user.id, password);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  register,
  login,
  me,
  verifyPassword,
  patchMe: profileController.patchMe,
  patchPassword: profileController.patchPassword,
  patchPasswordRequired: profileController.patchPasswordRequired,
  checkUsername: profileController.checkUsername,
};
