const authService = require('../services/authService');
const profileController = require('./profileController');

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
    const user = await authService.getMe(req.user.id);
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  login,
  me,
  patchMe: profileController.patchMe,
  patchPassword: profileController.patchPassword,
  checkUsername: profileController.checkUsername,
};
