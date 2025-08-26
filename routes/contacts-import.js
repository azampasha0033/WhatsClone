import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import csvParser from 'csv-parser';
import { Chat } from '../models/Chat.js';

const router = express.Router();

// Set up file upload using Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Unique file name
  }
});

const upload = multer({ storage: storage });

// Import contacts and save them as chats
router.post('/import', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = path.join(__dirname, '../uploads', req.file.filename);
  const contacts = [];

  fs.createReadStream(filePath)
    .pipe(csvParser())
    .on('data', (row) => {
      // Assuming the CSV now has only Name, Phone, and Labels columns
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
        res.status(200).send('Contacts imported successfully');
      } catch (error) {
        console.error('Error inserting contacts into DB:', error);
        res.status(500).send('Error importing contacts');
      } finally {
        // Clean up the uploaded file
        fs.unlinkSync(filePath);
      }
    })
    .on('error', (err) => {
      console.error('Error processing file:', err);
      res.status(500).send('Error processing the file');
    });
});

export default router;
