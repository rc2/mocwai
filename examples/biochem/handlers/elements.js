const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

const elementIndex = {};
let elements = [];
function init() {
  try {
    const fileContents = fs.readFileSync(path.join(__dirname, 'elements.yaml'), 'utf8');
    elements = yaml.load(fileContents);
    elements.forEach(element => {
      elementIndex[element.symbol] = element;
      elementIndex[element.protons] = element;
    });
  } catch (e) {
    console.error('Error reading or parsing YAML:', e);
    process.exit(-1);
  }
}


init();

module.exports = {
  get: async (req, res) => {
    if (!!req.params.id) { // handle -> /elements/:id
      const element = elementIndex[req.params.id];
      if (!element) {
        res.status(404).send(null);
      } else {
        res.status(200).send(JSON.stringify(element, null, 2));
      }
    } else { // handle -> /elements/
      return res.status(200).send(JSON.stringify(elements, null, 2));
    }
  },
  post: async(req, res) => {
    const element = req.body;
    elementIndex[element.symbol] = element;
    elementIndex[element.protons] = element;
    res.status(201);
  }
};
