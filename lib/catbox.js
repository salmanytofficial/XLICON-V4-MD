// ./lib/catbox.js

const fileType = require('file-type');
const FormData = require('form-data');
const fetch = require('node-fetch');
const MAX_FILE_SIZE_MB = 200;  // Define the maximum allowed file size

// Function to upload media
async function uploadMedia(buffer) {
  try {
    const { ext } = await fileType.fromBuffer(buffer);  // Use fromBuffer() to get file type
    const bodyForm = new FormData();
    bodyForm.append("fileToUpload", buffer, "file." + ext);
    bodyForm.append("reqtype", "fileupload");

    const res = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: bodyForm,
    });

    if (!res.ok) {
      throw new Error(`Upload failed with status ${res.status}: ${res.statusText}`);
    }

    const data = await res.text();
    return data;
  } catch (error) {
    console.error("Error during media upload:", error);
    throw new Error('Failed to upload media');
  }
}

// Function to handle media upload, checks file type and size
async function handleMediaUpload(m, mime) {
  if (/jpg|jpeg|png|webp|video|sticker|audio/.test(mime)) {
    XliconStickWait();  // Notify user of the wait
    let media = await (m.quoted ? m.quoted.download() : m.download());
    const fileSizeMB = media.length / (1024 * 1024);

    if (fileSizeMB > MAX_FILE_SIZE_MB) {
      return `File size exceeds the limit of ${MAX_FILE_SIZE_MB}MB.`;
    }

    let mediaUrl = await uploadMedia(media);  // Upload the media and get the URL
    return mediaUrl;
  } else {
    return 'Send the media you want to upload!';  // If no media is provided
  }
}

// Export the functions so they can be used in other files
module.exports = {
  uploadMedia,
  handleMediaUpload
};
