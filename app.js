const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const debug = require('debug')('oathkeeper-rule-generator:server');

const indexRouter = require('./routes/index');

const app = express();

app.use(express.json());
app.use(express.urlencoded({
  extended: false,
}));
app.use(cookieParser());
app.disable('x-powered-by');

app.use('/', indexRouter);

// catch 404 and forward to error handler
app.use((request, response, next) => {
  response.status(404).send({ code: 'NOT_FOUND' });
});

// other type of errors, it *might* also be a Runtime Error
app.use((err, request, response, next) => {
  console.log(err.message);
  console.log(err.stack);
  response.status(500).send({ code: 'INTERNAL_SERVER_ERROR' });
});

module.exports = app;
