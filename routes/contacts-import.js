import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { Chat } from '../models/Chat.js';  // Adjust this import as needed

const router = express.Router();

// Read environment variables
const uploadDir = process.env.BASE_DIR || path.join(process.cwd(), "uploads");
const publicUrl = process.env.PUBLIC_URL || "http://localhost:3000"; // Change if necessary

// Ensure the upload folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("✅ Created upload folder at", uploadDir);
}

// Configure Multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, uniqueName);
  }
});

const upload = multer({ storage });

// Import contacts and save them as chats
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const filePath = path.join(uploadDir, req.file.filename);  // Get the full path of the uploaded file
  const contacts = [];

  fs.createReadStream(filePath)
    .pipe(csvParser())
    .on('data', (row) => {
      // Assuming the CSV contains Name, Phone, and Labels columns
      contacts.push({
        name: row.Name,
        phone: row.Phone,
        labels: row.Labels,  // Assuming Labels is a comma-separated string
      });
    })
    .on('end', async () => {
      try {
        // Insert contacts into the Chat collection
        await Chat.insertMany(contacts);
        const fileUrl = `${publicUrl}/uploads/${req.file.filename}`;  // Build the file URL
        res.status(200).json({
          ok: true,
          fileUrl,
          message: 'Contacts imported successfully',
        });
      } catch (error) {
        console.error('Error inserting contacts into DB:', error);
        res.status(500).send('Error importing contacts');
      } finally {
        // Clean up the uploaded file
        fs.unlinkSync(filePath);  // Remove the file after processing
      }
    })
    .on('error', (err) => {
      console.error('Error processing file:', err);
      res.status(500).send('Error processing the file');
    });
});

export default router;
