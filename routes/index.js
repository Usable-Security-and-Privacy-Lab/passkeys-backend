var express = require('express');
var db = require('../db');

var router = express.Router();

// TODO: should errors be caught in the routes instead of in db.js so that we can send error msgs?

function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) {
    next();
  } else {
    return res.sendStatus(401);
  }
};

function fetchTodos(req, res, next) {
  db.pool.query('SELECT * FROM todos WHERE owner_id = $1', [
    req.user.id
  ], function (err, result) {
    if (err) { return next(err); }

    const rows = result.rows;

    var todos = rows.map(function (row) {
      return {
        id: row.id,
        title: row.title,
        completed: row.completed == 1 ? true : false,
        url: '/' + row.id
      }
    });
    res.locals.todos = todos;
    res.locals.activeCount = todos.filter(function (todo) { return !todo.completed; }).length;
    res.locals.completedCount = todos.length - res.locals.activeCount;
    next();
  });
}

/* GET home page. */
router.get('/', function (req, res, next) {
  if (!req.user) { return res.render('home'); }
  next();
}, fetchTodos, function (req, res, next) {
  res.locals.filter = null;
  return res.render('index', { user: req.user });
});

router.get('/checkAuthentication', isAuthenticated, function (req, res, next) {
  console.log("/checkAuthentication - User:" + req.user);
  if (req.isAuthenticated()) {
    return res.sendStatus(200);
  } else {
    return res.sendStatus(401)
  }
});

// Get info on current user
router.get('/me', isAuthenticated, async function (req, res, next) {
  const profile = await db.getProfileByID(req.user.id);
  if (profile == null) {
    return res.sendStatus(500);
  } else if (profile === undefined) {
    return res.sendStatus(404);
  }

  const numFriends = await db.getFriendsByID(req.user.id).length;

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
  return res.json(json);
});

// Update profile
router.put('/me', isAuthenticated, async function (req, res, next) {
  if (req.body.firstName == null && req.body.lastName == null) {
    return res.sendStatus(400).json({ "error": "Missing required fields" });
  }

  await db.updateProfile(req.user.id, req.body.firstName, req.body.lastName);
  return res.sendStatus(200);
});

// Get info on a user
router.get('/profiles/:userID', async function (req, res, next) {
  const profile = await db.getProfileByID(req.params.userID);
  if (profile == null) {
    return res.sendStatus(500);
  } else if (profile === undefined) {
    return res.sendStatus(404);
  }

  let relationship;
  if (req.isAuthenticated()) {
    if (req.params.userID === req.user.id) {
      relationship = "me";
    } else {
      const relationshipRow = await db.getRelationshipRow(req.user.id, req.params.userID);
      if (relationshipRow == null) {
        return res.sendStatus(500);
      } else if (relationshipRow === undefined) {
        relationship = "none";
      } else {
        if (relationshipRow.relationship === "friend") {
          relationship = "friend";
        } else { // requested
          let user1IsMe;
          if (relationshipRow.user1_id === req.user.id) {
            user1IsMe = true;
          } else {
            user1IsMe = false;
          }

          if (user1IsMe) {
            if (relationshipRow.relationship === "user1Requested") {
              relationship = "youRequested";
            } else {
              relationship = "theyRequested";
            }
          } else { // user2 is me
            if (relationshipRow.relationship === "user2Requested") {
              relationship = "youRequested";
            } else {
              relationship = "theyRequested";
            }
          }
        }
      }
    }
  } else {
    relationship = "unknown";
  }

  const numFriends = await db.getFriendsByID(req.params.userID)?.length; // TODO: error handling

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

  if (req.params.userID === req.user.id) {
    json.profile.balance = profile.balance;
  }

  return res.json(json);
});

// Add or remove a friend
router.post('/profiles/:userID', isAuthenticated, async function (req, res, next) {
  if (req.params.userID === req.user.id) {
    return res.sendStatus(400).json({ "error": "Cannot add self as friend" });
  }

  if (req.body.relationship == null) {
    return res.sendStatus(400).json({ "error": "Missing relationship field" });
  }

  if (req.body.relationship !== "friend" && req.body.relationship !== "none") {
    return res.sendStatus(400).json({ "error": "Invalid relationship field" });
  }

  if (req.body.relationship === "none") {
    await db.deleteRelationshipRow(req.user.id, req.params.userID);
    return res.sendStatus(200);
  }

  if (req.body.relationship === "friend") {
    let relationshipRow = await db.getRelationshipRow(req.user.id, req.params.userID);
    if (relationshipRow == null) {
      return res.sendStatus(500);
    } else if (relationshipRow === undefined) {
      await db.upsertRelationshipRow(req.user.id, req.params.userID, "request");
      return res.sendStatus(200);
    } else { // relationship exists
      if (relationshipRow.relationship === "friend") {
        return res.sendStatus(400).json({ "error": "Already friends" });
      } else if (relationshipRow.relationship.includes("Requested")) {
        let user1IsMe;
        if (relationshipRow.user1_id === req.user.id) {
          user1IsMe = true;
        } else {
          user1IsMe = false;
        }

        if (user1IsMe) {
          if (relationshipRow.relationship === "user1Requested") {
            res.sendStatus(400).json({ "error": "Already requested" });
          } else {
            await db.upsertRelationshipRow(req.user.id, req.params.userID, "friend");
            return res.sendStatus(200);
          }
        } else {
          if (relationshipRow.relationship === "user2Requested") {
            res.sendStatus(400).json({ "error": "Already requested" });
          } else {
            await db.upsertRelationshipRow(req.user.id, req.params.userID, "friend");
            return res.sendStatus(200);
          }
        }
      }
    }
  }
});

// TODO: Friend list privacy settings
// TODO: incrementally load friends?
// Get friends of a user
router.get('/profiles/:userID/friends', async function (req, res, next) {
  const friends = await db.getFriendsByID(req.params.userID);
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

// Search for profiles
router.get('/profiles', async function (req, res, next) {
  if (req.query.query == null) {
    return res.sendStatus(400).json({ "error": "Missing search query field" });
  }

  let limit = req.query.limit;
  if (limit == null) {
    limit = 25;
  }

  let profiles = await db.searchProfiles(req.query.query, limit);
  if (profiles == null) {
    return res.sendStatus(500);
  }

  let json = {
    "profiles": []
  }

  for (const profile in profiles) {
    json.profiles.push({
      "username": profile.username,
      "firstName": profile.first_name,
      "lastName": profile.last_name,
      "displayName": profile.first_name + " " + profile.last_name,
      "id": profile.id
    });
  }

  return res.json(json);
});

// TODO: validate input
// Transactions

// Initiate a transaction
// TODO: do we need to send transaction in response?
router.post('/transactions', isAuthenticated, async function (req, res, next) {
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

  let balance = await db.getProfileByID(req.user.id).balance;
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

  let transactionRow = await db.insertTransaction(req.user.id, req.body.target_id, req.body.amount, action, status, note, req.body.audience)
  if (transactionRow == null) {
    return res.sendStatus(500);
  }

  if (action === "pay") {
    await db.updateBalance(req.user.id, balance);
  }

  let actor = await db.getProfileByID(req.user.id);
  let target = await db.getProfileByID(req.body.target_id);

  const json = {
    "id": transactionRow.id,
    "balance": balance,
    "amount": req.body.amount,
    "action": action,
    "status": status,
    "note": note,
    "dateCreated": transactionRow.date_created,
    "dateCompleted": transactionRow.date_completed,
    "audience": audience,
    "actor": {
      "id": req.user.id,
      "username": actor.username,
      "firstName": actor.first_name,
      "lastName": actor.last_name,
      "displayName": actor.first_name + " " + actor.last_name
    },
    "target": {
      "id": req.body.target_id,
      "username": target.username,
      "firstName": target.first_name,
      "lastName": target.last_name,
      "displayName": target.first_name + " " + target.last_name
    }
  }
  return res.json(json);
});

// TODO: validate input
// List recent transactions
router.get('/transactions', isAuthenticated, async function (req, res, next) {
  let feed = req.query.feed;
  if (feed == null || (feed !== "friends" && feed !== "user" && feed !== "betweenUs")) {
    feed = "friends";
  }

  let limit = req.query.limit;
  if (limit == null) {
    limit = 25;
  } else if (limit > 100) {
    limit = 100;
  }

  let before = req.query.before;
  if (before == null) {
    before = Date.now() / 1000;
  }
  let after = req.query.after;
  if (after == null) {
    after = 0;
  }

  let lastTransactionID = req.query.lastTransactionID;
  if (lastTransactionID === undefined) {
    lastTransactionID = null;
  }

  let json = {
    "pagination": {},
    "data": []
  }
  let transactions;
  switch (feed) {
    case "friends":
      let friendIDRows = await db.getFriendsByID(req.user.id)
      console.log(friendIDRows); // TODO: remove
      let friendIDs = friendIDRows.map((row) => row.id);
      console.log(friendIDs); // TODO: remove
      if (friendIDs == null) {
        return res.sendStatus(500)
      } else {
        transactions = await db.getTransactionsForFriendsFeed(friendIDs, req.user.id, req.query.before, req.query.after, limit, lastTransactionID);
      }
      break;
    case "user":
      if (req.query.partyID == null) {
        return res.sendStatus(400).json({ "error": "No partyID specified" });
      }

      if (req.query.partyID === req.user.id) {
        transactions = await db.getMyRecentTransactions(req.user.id, req.query.before, req.query.after, limit, lastTransactionID);
      } else if (db.getRelationshipRow(req.user.id, req.query.partyID).relationship === "friend") {
        transactions = await db.getTransactionFeedOfFriend(req.user.id, req.query.partyID, req.query.before, req.query.after, limit, lastTransactionID);
      } else { // any other user
        transactions = await db.getTransactionFeedOfUser(req.user.id, req.query.partyID, req.query.before, req.query.after, limit, lastTransactionID);
      }
      break;
    case "betweenUs":
      if (req.query.partyID == null) {
        return res.sendStatus(400).json({ "error": "No partyID specified" });
      }

      transactions = await db.getTransactionsBetweenUsers(req.user.id, req.query.partyID, req.query.before, req.query.after, limit, lastTransactionID);
      break;
  }
  console.log(transactions); // TODO: remove

  if (transactions == null) {
    return res.sendStatus(500);
  } else {
    for (const transaction in transactions) {
      let actor = await db.getProfileByID(transaction.actor_id);
      let target = await db.getProfileByID(transaction.target_id);
      let transactionJSON = {
        "id": transaction.id,
        "action": transaction.action,
        "status": transaction.status,
        "note": transaction.note,
        "dateCreated": transaction.date_created,
        "dateCompleted": transaction.date_completed,
        "audience": transaction.audience,
        "actor": {
          "id": transaction.actor_id,
          "username": actor.username,
          "firstName": actor.first_name,
          "lastName": actor.last_name,
          "displayName": actor.first_name + " " + actor.last_name
        },
        "target": {
          "id": transaction.target_id,
          "username": target.username,
          "firstName": target.first_name,
          "lastName": target.last_name,
          "displayName": target.first_name + " " + target.last_name
        }
      }
      if (transaction.actor_id === req.user.id || transaction.target_id === req.user.id) {
        transactionJSON.amount = transaction.amount;
      }
      json.transactions.push(transactionJSON);
    }
  }
  if (transactions.length > 0) {
    json.pagination.lastTransactionID = transactions[transactions.length - 1].id;
  }
  return res.json(json);
});

router.get('/transactions/outstanding', isAuthenticated, async function (req, res, next) {
  let limit = req.query.limit;
  if (limit == null || limit > 100) {
    limit = 25;
  }

  let before = req.query.before;
  if (before == null) {
    before = Date.now() / 1000;
  }
  let after = req.query.after;
  if (after == null) {
    after = 0;
  }

  let lastTransactionID = req.query.lastTransactionID;
  if (lastTransactionID === undefined) {
    lastTransactionID = null;
  }

  let transactions = await db.getOutstandingTransactions(req.user.id, req.query.before, req.query.after, limit, lastTransactionID);
  if (transactions == null) {
    return res.sendStatus(500);
  } else {
    let json = {
      "pagination": {},
      "data": []
    };

    for (const transaction in transactions) {
      let actor = await db.getProfileByID(transaction.actor_id);
      let target = await db.getProfileByID(transaction.target_id);
      json.data.push({
        "id": transaction.id,
        "amount": transaction.amount,
        "action": transaction.action,
        "status": transaction.status,
        "note": transaction.note,
        "dateCreated": transaction.date_created,
        "dateCompleted": transaction.date_completed,
        "audience": transaction.audience,
        "actor": {
          "id": transaction.actor_id,
          "username": actor.username,
          "firstName": actor.first_name,
          "lastName": actor.last_name,
          "displayName": actor.first_name + " " + actor.last_name
        },
        "target": {
          "id": transaction.target_id,
          "username": target.username,
          "firstName": target.first_name,
          "lastName": target.last_name,
          "displayName": target.first_name + " " + target.last_name
        }
      });
    }
    if (transactions.length > 0) {
      json.pagination.lastTransactionID = transactions[transactions.length - 1].id;
    }
    return res.json(json);
  }
});

// Get info on a transaction
router.get('/transactions/:transactionID', isAuthenticated, async function (req, res, next) {
  const transaction = await db.getTransactionByID(req.params.transactionID);
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
    let actor = await db.getProfileByID(transaction.actor_id);
    let target = await db.getProfileByID(transaction.target_id);
    let transactionJSON = {
      "id": transaction.id,
      "action": transaction.action,
      "status": transaction.status,
      "note": transaction.note,
      "dateCreated": transaction.date_created,
      "dateCompleted": transaction.date_completed,
      "audience": transaction.audience,
      "actor": {
        "id": transaction.actor_id,
        "username": actor.username,
        "firstName": actor.first_name,
        "lastName": actor.last_name,
        "displayName": actor.first_name + " " + actor.last_name
      },
      "target": {
        "id": transaction.target_id,
        "username": target.username,
        "firstName": target.first_name,
        "lastName": target.last_name,
        "displayName": target.first_name + " " + target.last_name
      }
    };
    if (transaction.actor_id === req.user.id || transaction.target_id === req.user.id) {
      transactionJSON.amount = transaction.amount;
    }
    return res.json(transactionJSON);
  } else {
    return res.sendStatus(401).json({ "error": "Unauthorized" });
  }
});

// Complete a transaction request
router.put('/transactions/:transactionID', isAuthenticated, async function (req, res, next) {
  if (req.body.action == null ||
    (req.body.action !== "approve" && req.body.action !== "deny" && req.body.action !== "cancel")) {
    return res.sendStatus(400).json({ "error": "Invalid/missing action" });
  }

  const transaction = await db.getTransactionByID(req.params.transactionID);

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
        const balance = await db.getProfileByID(req.user.id).balance;
        if (balance < transaction.amount) {
          return res.sendStatus(400).json({ "error": "Insufficient funds" });
        }

        transaction = await db.updateTransactionStatus(req.params.transactionID, "settled");
        await db.updateBalance(transaction.target_id, transaction.amount); // TODO: verify this worked, rollback if not?
      }
      break;
    case "deny":
      if (transaction.target_id !== req.user.id) {
        return res.sendStatus(401).json({ "error": "Unauthorized" });
      } else {
        transaction = await db.updateTransactionStatus(req.params.transactionID, "denied");
      }
      break;
    case "cancel":
      if (transaction.actor_id !== req.user.id) { 
        return res.sendStatus(401).json({ "error": "Unauthorized" });
      } else {
        transaction = await db.updateTransactionStatus(req.params.transactionID, "cancelled");
        break;
      }
  }

  let actor = await db.getProfileByID(transaction.actor_id);
  let target = await db.getProfileByID(transaction.target_id);
  return res.json({
    "id": transaction.id,
    "amount": transaction.amount,
    "action": transaction.action,
    "status": transaction.status,
    "note": transaction.note,
    "dateCreated": transaction.date_created,
    "dateCompleted": transaction.date_completed,
    "audience": transaction.audience,
    "actor": {
      "id": transaction.actor_id,
      "username": actor.username,
      "firstName": actor.first_name,
      "lastName": actor.last_name,
      "displayName": actor.first_name + " " + actor.last_name
    },
    "target": {
      "id": transaction.target_id,
      "username": target.username,
      "firstName": target.first_name,
      "lastName": target.last_name,
      "displayName": target.first_name + " " + target.last_name
    }
  });
});

module.exports = router;
