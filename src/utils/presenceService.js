"use strict";

// In-memory online presence tracker.
// Stores empId → last heartbeat timestamp (ms).
// Resets on server restart — that is intentional; online status is ephemeral.

const heartbeatMap = new Map();
const ONLINE_MS = 60_000; // 60 seconds

function updatePresence(empId) {
  heartbeatMap.set(empId, Date.now());
}

function isOnline(empId) {
  const last = heartbeatMap.get(empId);
  return !!last && Date.now() - last < ONLINE_MS;
}

// Returns the subset of empIds that are currently online
function whoIsOnline(empIds) {
  return empIds.filter(isOnline);
}

module.exports = { updatePresence, isOnline, whoIsOnline };
