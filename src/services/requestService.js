"use strict";

const { buildFileUrl }   = require("./request/helpers");
const query              = require("./request/queryService");
const crud               = require("./request/crudService");
const approval           = require("./request/approvalService");
const gn                 = require("./request/gnService");
const broadcast          = require("./request/broadcastService");
const meta               = require("./request/metaService");

class RequestService {
  buildFileUrl(req, filename)                        { return buildFileUrl(req, filename); }

  getAll(user, q)                                    { return query.getAll(user, q); }
  getFilterOptions(user)                             { return query.getFilterOptions(user); }
  getById(reqId, user)                               { return query.getById(reqId, user); }
  getThread(requestId, viewerEmpId)                  { return query.getThread(requestId, viewerEmpId); }

  create(user, data, files, req)                     { return crud.create(user, data, files, req); }
  editRequest(reqId, user, body, files, req)         { return crud.editRequest(reqId, user, body, files, req); }
  deleteRequest(reqId, user)                         { return crud.deleteRequest(reqId, user); }

  approval(reqId, user, body)                        { return approval.approval(reqId, user, body); }
  close(reqId, user, body, files, req)               { return approval.close(reqId, user, body, files, req); }
  acknowledge(reqId, user, body)                     { return approval.acknowledge(reqId, user, body); }
  attachAfterClose(reqId, user, files, req)          { return approval.attachAfterClose(reqId, user, files, req); }
  stopRecurring(reqId, user)                         { return approval.stopRecurring(reqId, user); }

  getHodPendingRequests(user, q)                     { return gn.getHodPendingRequests(user, q); }
  getManagementFilterOptions()                       { return gn.getManagementFilterOptions(); }
  hodApproval(reqId, user, body)                     { return gn.hodApproval(reqId, user, body); }

  broadcastUsers(user)                               { return broadcast.broadcastUsers(user); }
  broadcastSend(user, body, files, req)              { return broadcast.broadcastSend(user, body, files, req); }

  getDepartments()                                   { return meta.getDepartments(); }
  getLocations()                                     { return meta.getLocations(); }
  getUsersByDept(depts)                              { return meta.getUsersByDept(depts); }
  markSeen(requestId, empId)                         { return meta.markSeen(requestId, empId); }
  markUnread(requestId, empId)                       { return meta.markUnread(requestId, empId); }
  getRoleCounts(user)                                { return meta.getRoleCounts(user); }
}

module.exports = new RequestService();