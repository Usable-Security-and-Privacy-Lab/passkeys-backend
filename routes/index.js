var express = require('express');
var db = require('../db');

var router = express.Router();
router.use('/', secureRouter); // TODO: Path
var secureRouter = express.Router(); // TODO: Merge URL params?
secureRouter.use((req, res, next) => {
  console.log("index.js auth router middleware - User:" + req.user);
  if (req.isAuthenticated()) {
    next();
  } else {
    return res.sendStatus(401);
  }
});

/* GET home page. */
router.get('/', function (req, res, next) {
  if (!req.user) { return res.render('home'); }
  next();
}, fetchTodos, function (req, res, next) {
  res.locals.filter = null;
  return res.render('index', { user: req.user });
});

secureRouter.get('/checkAuthentication', function (req, res, next) {
  console.log("/checkAuthentication - User:" + req.user);
  if (req.isAuthenticated()) {
    return res.sendStatus(200);
  } else {
    return res.sendStatus(401)
  }
});

// Get info on current user
secureRouter.get('/me', function (req, res, next) {
  const profile = db.getProfileByID(req.user.id);
  if (profile == null) {
    return res.sendStatus(500);
  } else if (profile === undefined) {
    return res.sendStatus(404);
  }

  const numFriends = getFriendsByID(req.user.id).length;

  const json = {
    "profile": {
      "username": req.user.username,
      "firstName": profile.first_name,
      "lastName": profile.last_name,
      "displayName": profile.first_name + " " + profile.last_name,
      "relationship": "me",
      "friendsCount": numFriends,
      "id": req.user.id,
      "balance": profile.balance
    }
  }
  return res.status(200).json(json);
});

// Get info on a user
router.get('/profiles/:userID', function (req, res, next) {
  const profile = db.getProfileByID(req.params.userID);
  if (profile == null) {
    return res.sendStatus(500);
  } else if (profile === undefined) {
    return res.sendStatus(404);
  }

  let relationship;
  if (req.isAuthenticated()) {
    const relationshipRow = db.getRelationshipRow(req.user.id, req.params.userID);
    if (relationshipRow == null) {
      return res.sendStatus(500);
    } else if (relationshipRow === undefined) {
      relationship = "none";
    } else {
      relationship = relationshipRow.relationship;
    }
  } else {
    relationship = "unknown";
  }

  const numFriends = getFriendsByID(req.params.userID)?.length; // TODO: error handling

  const json = {
    "profile": {
      "username": profile.username,
      "firstName": profile.first_name,
      "lastName": profile.last_name,
      "displayName": profile.first_name + " " + profile.last_name,
      "relationship": relationship,
      "friendsCount": numFriends,
      "id": req.user.id
    }
  }
});

// TODO: Friend list privacy settings
// TODO: incrementally load friends?
// Get friends of a user
router.get('/profiles/:userID/friends', function (req, res, next) {
  const friends = db.getFriendsByID(req.params.userID);
  if (friends == null) {
    return res.sendStatus(404);
  }

  const json = {
    "friends": []
  }

  for (const friend in friends) {
    json.friends.push({
      "username": friend.username,
      "firstName": friend.first_name,
      "lastName": friend.last_name,
      "displayName": friend.first_name + " " + friend.last_name,
      "id": friend.id
    });
  }
});

// TODO: validate input
// Transactions

// Initiate a transaction
// TODO: do we need to send transaction in response?
secureRouter.post('/transactions', function (req, res, next) {
  if (req.body.targetID == null || req.body.amount == null || req.body.note == null) {
    return res.sendStatus(400).json({ "error": "Missing required fields" });
  }

  if (db.getProfileByID(req.body.payeeID) === undefined) {
    return res.sendStatus(404).json({ "error": "Payee profile not found" });
  }

  let action = req.body.action;
  if (action == null) {
    action = "pay";
  }

  let balance = db.getProfileByID(req.user.id).balance;
  let status = "pending";

  if (action === "pay") {
    status = "settled";
    if (balance < req.body.amount) {
      return res.sendStatus(400).json({ "error": "Insufficient funds" });
    }
    balance -= req.body.amount;
  }

  let note = req.body.note;
  if (note.length > 280) {
    note = note.substring(0, 280);
  }

  let audience = req.body.audience;
  if (audience !== "public" && audience !== "friends" && audience !== "private") {
    audience = "public";
  }

  let dates = db.insertTransaction(req.user.id, req.body.target_id, req.body.amount, action, status, note, req.body.audience)
  if (dates == null) {
    return res.sendStatus(500);
  }

  if (action === "pay") {
    db.updateBalance(req.user.id, balance);
  }

  const json = {
    "balance": balance,
    "transaction": {
      "actorID": req.user.id,
      "targetID": req.body.target_id,
      "amount": req.body.amount,
      "action": action,
      "status": status,
      "note": note,
      "dateCreated": dates[0],
      "dateCompleted": dates[1],
      "audience": audience
    }
  }

  return res.status(200).json(json);
});

// TODO: validate input
// List recent transactions
secureRouter.get('/transactions', function (req, res, next) {
  let feed = req.body.feed;
  if (feed == null || (feed !== "friends" && feed !== "user" && feed !== "betweenUs")) {
    feed = "friends";
  }

  let limit = req.body.limit;
  if (limit == null) {
    limit = 25;
  } else if (limit > 100) {
    limit = 100;
  }

  let before = req.body.before;
  if (before == null) {
    before = Date.now() / 1000;
  }
  let after = req.body.after;
  if (after == null) {
    after = 0;
  }

  let lastTransactionID = req.body.lastTransactionID;
  if (lastTransactionID === undefined) {
    lastTransactionID = null;
  }

  let json = {
    "pagination": {

    },
    "transactions": []
  }
  let transactions;
  switch (feed) {
    case "friends":
      let friendIDs = db.getFriendsByID(req.user.id).map(friend => friend.id);
      if (friendIDs == null) {
        return res.sendStatus(404).json({ "error": "No friends found for the current user" });
      } else {
        transactions = db.getTransactionsForFriendsFeed(friendIDs, req.user.id, req.body.before, req.body.after, limit, lastTransactionID);
      }
      break;
    case "user":
      if (req.body.partyID == null) {
        return res.sendStatus(400).json({ "error": "No partyID specified" });
      }

      if (req.body.partyID === req.user.id) {
        transactions = db.getMyRecentTransactions(req.user.id, req.body.before, req.body.after, limit, lastTransactionID);
      } else if (db.getRelationshipRow(req.user.id, req.body.partyID).relationship === "friend") {
        transactions = db.getTransactionFeedOfFriend(req.user.id, req.body.partyID, req.body.before, req.body.after, limit, lastTransactionID);
      } else { // any other user
        transactions = db.getTransactionFeedOfUser(req.user.id, req.body.partyID, req.body.before, req.body.after, limit, lastTransactionID);
      }
      break;
    case "betweenUs":
      if (req.body.partyID == null) {
        return res.sendStatus(400).json({ "error": "No partyID specified" });
      }

      transactions = db.getTransactionsBetweenUsers(req.user.id, req.body.partyID, req.body.before, req.body.after, limit, lastTransactionID);
      break;
  }

  if (transactions == null) {
    return res.sendStatus(500);
  } else {
    for (const transaction in transactions) {
      json.transactions.push({
        "id": transaction.id,
        "actorID": transaction.actor_id,
        "targetID": transaction.target_id,
        "amount": transaction.amount,
        "action": transaction.action,
        "status": transaction.status,
        "note": transaction.note,
        "dateCreated": transaction.date_created,
        "dateCompleted": transaction.date_completed,
        "audience": transaction.audience
      });
    }
  }
  json.pagination.lastTransactionID = transactions[transactions.length - 1].id;
  return res.status(200).json(json);
});

secureRouter.get('/transactions/outstanding', function (req, res, next) {
  let limit = req.body.limit;
  if (limit == null || limit > 100) {
    limit = 25;
  }

  let before = req.body.before;
  if (before == null) {
    before = Date.now() / 1000;
  }
  let after = req.body.after;
  if (after == null) {
    after = 0;
  }

  let lastTransactionID = req.body.lastTransactionID;
  if (lastTransactionID === undefined) {
    lastTransactionID = null;
  }

  let transactions = db.getOutstandingTransactions(req.user.id, req.body.before, req.body.after, limit, lastTransactionID);
});

// Get info on a transaction
secureRouter.get('/transactions/:transactionID', function (req, res, next) {
  const transaction = db.getTransactionByID(req.params.transactionID);
  if (transaction == null) {
    return res.sendStatus(404).json({ "error": "Transaction not found" });
  }

  let allowAccess = false;
  switch (transaction.audience) {
    case "public":
      allowAccess = true;
      break;
    case "friends":
      if (db.getRelationshipRow(req.user.id, transaction.actor_id).relationship === "friend") {
        allowAccess = true;
      }
      break;
    case "private":
      if (transaction.actor_id === req.user.id || transaction.target_id === req.user.id) {
        allowAccess = true;
      }
      break;
  }

  if (allowAccess) {
    return res.json({
      "transaction": {
        "id": transaction.id,
        "actorID": transaction.actor_id,
        "targetID": transaction.target_id,
        "amount": transaction.amount,
        "action": transaction.action,
        "status": transaction.status,
        "note": transaction.note,
        "dateCreated": transaction.date_created,
        "dateCompleted": transaction.date_completed,
        "audience": transaction.audience
      }
    });
  } else {
    return res.sendStatus(401).json({ "error": "Unauthorized" });
  }
});

// Complete a transaction request
secureRouter.put('/transactions/:transactionID', function (req, res, next) {
  if (req.body.action == null ||
    (req.body.action !== "approve" && req.body.action !== "deny" && req.body.action !== "cancel")) {
    return res.sendStatus(400).json({ "error": "Invalid/missing action" });
  }

  const transaction = db.getTransactionByID(req.params.transactionID);

  if (transaction == null) {
    return res.sendStatus(404).json({ "error": "Transaction not found" });
  } else if (transaction.status !== "pending") {
    return res.sendStatus(400).json({ "error": "Transaction is not pending" });
  }

  switch (req.body.action) {
    case "approve":
      if (transaction.target_id !== req.user.id) {
        return res.sendStatus(401).json({ "error": "Unauthorized" });
      } else {
        const balance = db.getProfileByID(req.user.id).balance;
        if (balance < transaction.amount) {
          return res.sendStatus(400).json({ "error": "Insufficient funds" });
        }

        transaction = db.updateTransactionStatus(req.params.transactionID, "settled");
        db.updateBalance(transaction.target_id, transaction.amount); // TODO: verify this worked, rollback if not?
      }
      break;
    case "deny":
      if (transaction.target_id !== req.user.id) {
        return res.sendStatus(401).json({ "error": "Unauthorized" });
      } else {
        transaction = db.updateTransactionStatus(req.params.transactionID, "denied");
      }
      break;
    case "cancel":
      transaction = db.updateTransactionStatus(req.params.transactionID, "cancelled");
      break;
  }

  return res.json({
    "transaction": {
      "id": transaction.id,
      "actorID": transaction.actor_id,
      "targetID": transaction.target_id,
      "amount": transaction.amount,
      "action": transaction.action,
      "status": transaction.status,
      "note": transaction.note,
      "dateCreated": transaction.date_created,
      "dateCompleted": transaction.date_completed,
      "audience": transaction.audience
    }
  });
});

module.exports = secureRouter;
