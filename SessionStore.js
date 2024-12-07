// Import required modules
const { File } = require('megajs');
const fs = require('fs');
const config = require('./config'); // Import config.js

// Use the prefix from config.js
const prefix = config.GLOBAL.SESSION_ID; 
const output = "./session/"; // Path where the creds.json will save

// Function to save credentials
async function saveCreds(id) {
  if (!id.startsWith(prefix)) {
    throw new Error(`Prefix doesn't match. Check if "${prefix}" is correct.`);
  }

  // Extract the unique ID part from the URL
  const url = `https://mega.nz/file/${id.replace(prefix, "")}`;
  const file = File.fromURL(url);

  // Load file attributes and download the data
  await file.loadAttributes();
  const pth = output + "creds.json";

  // Ensure the output directory exists
  if (!fs.existsSync(output)) {
    fs.mkdirSync(output, { recursive: true });
  }

  // Download file data and save it locally
  const data = await file.downloadBuffer();
  fs.writeFileSync(pth, data);

  console.log(`Credentials saved to ${pth}`);
}

module.exports = { saveCreds };
