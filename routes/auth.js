var express = require('express');
var passport = require('passport');
var WebAuthnStrategy = require('passport-fido2-webauthn');
var SessionChallengeStore = require('passport-fido2-webauthn').SessionChallengeStore;
var base64url = require('base64url');
var uuid = require('uuid').v4;
var pool = require('../db');


var store = new SessionChallengeStore();

passport.use(new WebAuthnStrategy({ store: store }, function verify(id, userHandle, cb) {
  pool.query('SELECT * FROM public_key_credentials WHERE external_id = $1', [id], function(err, result) {
    if (err) { 
      console.log(err);
      return cb(err); 
    }
    const row = result.rows[0];
    if (!row) { return cb(null, false, { message: 'Invalid key. '}); }
    var publicKey = row.public_key;
    pool.query('SELECT * FROM users WHERE id = $1', [row.user_id], function(err, result) {
      if (err) { 
        console.log(err);
        return cb(err); 
      }
      const userRow = result.rows[0];
      if (!userRow) { return cb(null, false, { message: 'Invalid key. '}); }
      if (Buffer.compare(userRow.handle, userHandle) != 0) {
        return cb(null, false, { message: 'Invalid key. '});
      }
      return cb(null, userRow, publicKey);
    });
  });
}, function register(user, id, publicKey, cb) {
  pool.query('INSERT INTO users (username, name, handle) VALUES ($1, $2, $3) RETURNING id', [
    user.name,
    user.displayName,
    user.id
  ], function(err, result) {
    if (err) { 
      console.log(err);
      return cb(err); 
    }
    var newUser = {
      id: result.rows[0].id,
      username: user.name,
      name: user.displayName
    };
    pool.query('INSERT INTO public_key_credentials (user_id, external_id, public_key) VALUES ($1, $2, $3)', [
      newUser.id,
      id,
      publicKey
    ], function(err) {
      if (err) { 
        console.log(err);
        return cb(err); 
      }
      return cb(null, newUser);
    });
  });
}));

passport.serializeUser(function(user, cb) {
  process.nextTick(function() {
    cb(null, { id: user.id, username: user.username, name: user.name });
  });
});

passport.deserializeUser(function(user, cb) {
  process.nextTick(function() {
    return cb(null, user);
  });
});


var router = express.Router();

router.get('/login', function(req, res, next) {
  res.render('login');
});

router.post('/login/public-key', passport.authenticate('webauthn', {
  failureMessage: true,
  failWithError: true
}), function(req, res, next) {
  res.json({ ok: true, location: '/' });
}, function(err, req, res, next) {
  var cxx = Math.floor(err.status / 100);
  if (cxx != 4) { return next(err); }
  res.json({ ok: false, location: '/login' });
});

router.post('/login/public-key/challenge', function(req, res, next) {
  store.challenge(req, function(err, challenge) {
    if (err) { return next(err); }
    res.json({ challenge: base64url.encode(challenge) });
  });
});

router.post('/logout', function(req, res, next) {
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/');
  });
});

router.get('/signup', function(req, res, next) {
  res.render('signup');
});

router.post('/signup/public-key/challenge', function(req, res, next) {
  var handle = Buffer.alloc(16);
  handle = uuid({}, handle);
  var user = {
    id: handle,
    name: req.body.username,
    displayName: req.body.name
  };
  store.challenge(req, { user: user }, function(err, challenge) {
    if (err) { return next(err); }
    user.id = base64url.encode(user.id);
    res.json({ user: user, challenge: base64url.encode(challenge) });
  });
});

module.exports = router;
