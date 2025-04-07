const { parse } = require('path-to-regexp');

function getVarsFromParamsPath(pattern) {
  const tokens = parse(pattern);
  return tokens
    .tokens
    .filter(t => t.type === 'param')
    .map(t => t.name);
}

function isText(contentType) {
  return !!(contentType.match(/text|application\/(xml|x-sh|x-www-form-urlencoded|javascript)/));
}

module.exports = {
  getVarsFromParamsPath,
  isText,
};
