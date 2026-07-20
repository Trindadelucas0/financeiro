const userService = require('../services/userService');
const adminClientService = require('../services/adminClientService');
const profileController = require('./profileController');

async function createUser(req, res, next) {
  try {
    const user = await userService.createUser(req.body);
    return res.status(201).json({ user });
  } catch (err) {
    return next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const users = await userService.listUsers();
    return res.json({ users });
  } catch (err) {
    return next(err);
  }
}

async function patchUser(req, res, next) {
  try {
    const user = await userService.updateUser(req.params.id, req.body);
    return res.json({ user });
  } catch (err) {
    return next(err);
  }
}

async function listClients(req, res, next) {
  try {
    const clients = await adminClientService.listManualClients();
    return res.json({ clients });
  } catch (err) {
    return next(err);
  }
}

async function listSiteSignups(req, res, next) {
  try {
    const clients = await adminClientService.listSiteSignups();
    return res.json({ clients });
  } catch (err) {
    return next(err);
  }
}

async function createClient(req, res, next) {
  try {
    const result = await adminClientService.createManualClient(req.body);
    return res.status(201).json(result);
  } catch (err) {
    return next(err);
  }
}

async function registerClientPayment(req, res, next) {
  try {
    const result = await adminClientService.registerManualPayment(req.params.id, req.body);
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

async function registerSiteSignupPayment(req, res, next) {
  try {
    const result = await adminClientService.registerClientPayment(req.params.id, {
      ...req.body,
      billingSource: 'site',
    });
    return res.json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createUser,
  listUsers,
  patchUser,
  listClients,
  listSiteSignups,
  createClient,
  registerClientPayment,
  registerSiteSignupPayment,
  listFeedback: profileController.listFeedback,
  patchFeedback: profileController.patchFeedback,
};
