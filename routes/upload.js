import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// Read environment variables
const uploadDir = process.env.BASE_DIR || path.join(process.cwd(), "uploads");
const publicUrl = process.env.PUBLIC_URL || "http://localhost:3000";

// Ensure upload folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  //console.log("✅ Created upload folder at", uploadDir);
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

// Upload API
router.post("/", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // Build public URL
  const fileUrl = `${publicUrl}/uploads/${req.file.filename}`;

  res.json({
    ok: true,
    fileUrl,
    mimetype: req.file.mimetype,
    filename: req.file.originalname
  });
});

export default router;
