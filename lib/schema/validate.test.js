const fs = require('fs');
const path = require('path');

const { test } = require('uvu');
const assert = require('uvu/assert');

const validate = require('./validate');

test('schema should pass', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'testdata', 'pass.json')).toString());
  const have = validate(config);
  const want = {pass: true};
  assert.equal(want.pass, have.pass);
});

test('schema should fail', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'testdata', 'fail.json')).toString());
  const have = validate(config);
  const want = {pass: false};
  assert.equal(want.pass, have.pass);
});

test.run();
