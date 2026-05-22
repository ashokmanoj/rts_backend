"use strict";

const admin = require("firebase-admin");
const path  = require("path");

const serviceAccount = require(path.join(__dirname, "apnd-apps-firebase-adminsdk-fbsvc-5f018d630d.json"));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
