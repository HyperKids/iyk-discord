const fs = require('fs');
const path = require('path');

// Function to read all .json files in the "embeds" folder
function readEmbedFiles() {
  const embeds = {};
  const embedFiles = fs.readdirSync(__dirname).filter(file => file.endsWith('.json'));

  for (const file of embedFiles) {
    const embedName = file.replace('.json', '');
    const embedData = require(path.join(__dirname, file));
    embeds[embedName] = embedData;
  }

  return embeds;
}

module.exports = readEmbedFiles();