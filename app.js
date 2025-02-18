require('dotenv').config();
var createError = require('http-errors');
var express = require('express');
var path = require('path');
var multer  = require('multer');
var cookieParser = require('cookie-parser');
var session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
// var csrf = require('csurf');
var passport = require('passport');
var logger = require('morgan');
var pool = require('./db').pool;

var indexRouter = require('./routes/index');
var authRouter = require('./routes/auth');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.locals.pluralize = require('pluralize');

// Disable cacheing so 304 is never sent
app.disable('etag');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(multer().none());
app.use(cookieParser());
app.get('/.well-known/apple-app-site-association', (req, res) => {
  // Send the AASA with correct Content-Type
  res.set('Content-Type', 'application/json');
  res.sendFile(path.join(__dirname + '/public/.well-known/apple-app-site-association'));
});
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false, // don't save session if unmodified
  saveUninitialized: false, // don't create session until something stored
  store: new PgSession({
    pool: pool,
    createTableIfMissing: true
  }),
  cookie: {
    httpOnly: true,
    secure: true
    // SameSite: ??? // TODO:
  }
}));
//app.use(csrf());
app.use(passport.authenticate('session'));
app.use(function(req, res, next) {
  var msgs = req.session.messages || [];
  res.locals.messages = msgs;
  res.locals.hasMessages = !! msgs.length;
  req.session.messages = [];
  next();
});
app.use(function(req, res, next) {
  //res.locals.csrfToken = req.csrfToken();
  res.locals.csrfToken = 'TODO';
  next();
});
app.set('trust proxy', true); // For Heroku compatability


app.use('/', indexRouter);
app.use('/', authRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  console.log(err) // TODO: remove in production
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;
