/**
 * File Upload Handler - Multipart/Form-Data
 * Handles PDF uploads via standard multipart form data instead of base64 JSON
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { processExternalAssessment } from './assessment-processor';

const router = Router();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

// POST /api/upload-assessment
router.post('/upload-assessment', upload.single('file'), async (req: Request, res: Response) => {
  try {
    console.log('📤 File upload endpoint hit');
    
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`📄 File received: ${req.file.originalname} (${req.file.size} bytes)`);

    // Convert buffer to base64 for compatibility with existing processor
    const fileData = req.file.buffer.toString('base64');
    
    // Process the assessment
    const result = await processExternalAssessment(req.file.originalname, fileData);
    
    console.log('✅ Assessment processed successfully');
    res.json(result);
    
  } catch (error: any) {
    console.error('❌ Upload processing failed:', error);
    res.status(500).json({ 
      error: 'Failed to process assessment',
      message: error.message 
    });
  }
});

export default router;
