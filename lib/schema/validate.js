const fs = require('fs');
const path = require('path');
const Ajv = require('ajv');

const ajv = new Ajv({ allErrors: true, useDefaults: true });
const schema = require(path.join(__dirname, 'data', 'schema.json')); // your schema file

const validate = ajv.compile(schema);

module.exports = (config) => {
  const result = {
    pass: false,
  };
  if (validate(config)) {
    result.pass = true;
  } else {
    result.errors = validate.errors;
  }
  return result;
};
