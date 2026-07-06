"use strict";

const admin = require("firebase-admin");
const path  = require("path");

let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
  // Local dev: load from file
  serviceAccount = require(path.join(__dirname, "apnd-apps-firebase-adminsdk-fbsvc-5f018d630d.json"));
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

module.exports = admin;
