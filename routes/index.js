var express = require('express');
var pool = require('../db');

var router = express.Router();
router.use('/', secureRouter); // TODO: Path
var secureRouter = express.Router(); // TODO: Merge params?
secureRouter.use((req, res, next) => {
  console.log("index.js auth router middleware - User:" + req.user);
  if (req.isAuthenticated()) {
    next();
  } else {
    res.sendStatus(401);
  }
});

/* GET home page. */
router.get('/', function(req, res, next) {
  if (!req.user) { return res.render('home'); }
  next();
}, fetchTodos, function(req, res, next) {
  res.locals.filter = null;
  res.render('index', { user: req.user });
});

secureRouter.get('/checkAuthentication', function(req, res, next) {
  console.log("/checkAuthentication - User:" + req.user);
  if (req.isAuthenticated()) {
    res.sendStatus(200);
  } else {
    res.sendStatus(401)
  }
});

// Get info on current user
secureRouter.get('/me', function(req, res, next) {
  const profile = pool.getProfileByID(req.user.id);
  if (profile == null) {
    res.sendStatus(500);
  } else if (profile === undefined) {
    res.sendStatus(404);
  }

  const numFriends = getFriendsByID(req.user.id).length;

  const json = {
    "profile": {
      "username": req.user.username,
      "first_name": profile.first_name,
      "last_name": profile.last_name,
      "display_name": profile.first_name + " " + profile.last_name,
      "relationship": "me",
      "friends_count": numFriends, 
      "id": req.user.id,
      "balance": profile.balance
    }
  }
  res.status(200).json(json);
});

// Get info on a user
router.get('/profiles/:user_id', function(req, res, next) {
  const profile = pool.getProfileByID(req.params.user_id);
  if (profile == null) {
    res.sendStatus(500);
  } else if (profile === undefined) {
    res.sendStatus(404);
  }

  let relationship;
  if (req.isAuthenticated()) {
    const relationshipRow = pool.getRelationshipRow(req.user.id, req.params.user_id);
    if (relationshipRow == null) {
      res.sendStatus(500);
    } else if (relationshipRow === undefined) {
      relationship = "none";
    } else {
      relationship = relationshipRow.relationship;
    }
  } else {
    relationship = "unknown";
  }

  const numFriends = getFriendsByID(req.params.user_id)?.length; // TODO: error handling

  const json = {
    "profile": {
      "username": profile.username,
      "first_name": profile.first_name,
      "last_name": profile.last_name,
      "display_name": profile.first_name + " " + profile.last_name,
      "relationship": relationship,
      "friends_count": numFriends,
      "id": req.user.id
    }
  }
});

// Get friends of a user
router.get('/profiles/:user_id/friends', function(req, res, next) {
  const friends = pool.getFriendsByID(req.params.user_id);
  if (friends == null) {
    res.sendStatus(404);
  }

  const json = { 
    "friends": []
  }

  for (const friend in friends) {
    json.friends.push({
      "username": friend.username,
      "first_name": friend.first_name,
      "last_name": friend.last_name,
      "display_name": friend.first_name + " " + friend.last_name,
      "id": friend.id 
    });
  }
});

// Payments/Transactions

// Make a payment/charge
secureRouter.post('/payments', function(req, res, next) {
  
});

// List recent payments/charges
secureRouter.get('/payments', function(req, res, next) {

});

// Get info on a payment/charge
secureRouter.get('/payments/:payment_id', function(req, res, next) {

});

// Complete a payment/charge request
secureRouter.put('/payments/:payment_id', function(req, res, next) {

});

module.exports = secureRouter;
