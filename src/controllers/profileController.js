const profileService = require('../services/profileService');

async function patchMe(req, res, next) {
  try {
    const user = await profileService.updateProfile(req.user.id, req.body);
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

async function patchPassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    await profileService.changePassword(req.user.id, currentPassword, newPassword);
    return res.status(204).send();
  } catch (err) {
    return next(err);
  }
}

async function createFeedback(req, res, next) {
  try {
    const feedback = await profileService.createFeedback(req.user.id, req.body);
    return res.status(201).json({ feedback });
  } catch (err) {
    return next(err);
  }
}

async function listFeedback(req, res, next) {
  try {
    const feedback = await profileService.listFeedback();
    return res.json({ feedback });
  } catch (err) {
    return next(err);
  }
}

async function patchFeedback(req, res, next) {
  try {
    const item = await profileService.markFeedbackRead(req.params.id);
    return res.json({ feedback: item });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  patchMe,
  patchPassword,
  createFeedback,
  listFeedback,
  patchFeedback,
};
