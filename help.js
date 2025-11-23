require("dotenv").config();
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const { transcribeAudio } = require("./transcribe.js");
const { synthesizeSpeech } = require("./pol.js");
const { generateTextWithGranite } = require("./graniteLLM.js");

const app = express();
const upload = multer();
const Port = parseInt(process.env.PORT, 10) || 3000;

// Enable CORS for local development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

// Endpoint to delete audio file after playback using fs module
app.post("/delete-audio", express.json(), async (req, res) => {
  try {
    const { filename } = req.body;
    const audioPath = path.join(__dirname, 'aud_op', filename || 'current_audio.mp3');
    
    if (fs.existsSync(audioPath)) {
      fs.unlinkSync(audioPath);
      console.log(`🗑️ Deleted audio file: ${filename || 'current_audio.mp3'}`);
      res.json({ success: true, message: `Audio file deleted successfully` });
    } else {
      res.json({ success: false, message: "Audio file not found" });
    }
  } catch (error) {
    console.error("❌ Error deleting audio file:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Complete AI Pipeline: Speech → Text → AI Processing → Speech
async function processAudioWithAI(fileName) {
  try {
    console.log("🚀 Starting complete AI pipeline for:", fileName);
    
    // Step 1: Transcribe audio to text
    console.log("📝 Step 1: Transcribing audio...");
    const transcribedText = await transcribeAudio(fileName);
    console.log("✅ Transcription completed:", transcribedText.substring(0, 100) + "...");
    
    // Step 2: Process text with Granite LLM
    console.log("🧠 Step 2: Processing with Granite LLM...");
    const aiResponse = await generateTextWithGranite(transcribedText);
    console.log("✅ AI processing completed:", aiResponse.substring(0, 100) + "...");
    
    // Step 3: Convert AI response to speech
    console.log("🎤 Step 3: Converting AI response to speech...");
    const speechResult = await synthesizeSpeech(aiResponse);
    
    if (speechResult.success) {
      console.log("✅ Complete AI pipeline finished successfully!");
      console.log("🎵 Audio available at:", speechResult.relativePath);
      return {
        success: true,
        transcribedText: transcribedText,
        aiResponse: aiResponse,
        audioFile: speechResult.relativePath,
        message: "AI pipeline completed successfully"
      };
    } else {
      throw new Error(`Speech synthesis failed: ${speechResult.error}`);
    }
    
  } catch (error) {
    console.error("❌ AI Pipeline error:", error.message);
    return {
      success: false,
      error: error.message,
      step: "AI Pipeline"
    };
  }
}

app.post("/upload-to-s3", upload.single("audio"), async (req, res) => {
  console.log("📥 Received upload request");
  
  if (!req.file) {
    console.error("❌ No audio file received");
    return res.status(400).send("No audio file received");
  }
  
  console.log("📁 File details:", {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  });

  const timestamp = Date.now();
  const fileName = `recording-${timestamp}.mp3`;

  const command = new PutObjectCommand({
    Bucket: "mint-in",
    Key: fileName,
    Body: req.file.buffer,
    ContentType: "audio/mp3"
  });

  try {
    console.log("☁️ Uploading to S3...");
    const result = await s3.send(command);
    console.log("✅ S3 upload successful:", result);
    
    // Wait 5-10 seconds before starting transcription
    const delay = 5000; // Fixed delay of 7 seconds
    console.log(`⏳ Waiting ${delay/1000} seconds before starting transcription...`);
    
    // Wait for the delay, then process the complete AI pipeline
    await new Promise(resolve => setTimeout(resolve, delay));
    
    try {
      console.log("🚀 Starting complete AI pipeline for:", fileName);
      const pipelineResult = await processAudioWithAI(fileName);
      
      if (pipelineResult.success) {
        console.log("🎉 Complete AI pipeline finished!");
        console.log("📄 Original speech:", pipelineResult.transcribedText);
        console.log("🧠 AI Response:", pipelineResult.aiResponse);
        console.log("🎵 Audio file ready:", pipelineResult.audioFile);
        
        // Send response with all pipeline results
        res.json({
          success: true,
          message: `Uploaded as ${fileName} and processed successfully`,
          fileName: fileName,
          transcribedText: pipelineResult.transcribedText,
          aiResponse: pipelineResult.aiResponse,
          audioFile: pipelineResult.audioFile
        });
      } else {
        console.error("❌ AI Pipeline failed:", pipelineResult.error);
        res.status(500).json({
          success: false,
          message: `Upload successful but AI pipeline failed: ${pipelineResult.error}`,
          fileName: fileName
        });
      }
    } catch (pipelineErr) {
      console.error("❌ Complete pipeline error:", pipelineErr);
      res.status(500).json({
        success: false,
        message: `Upload successful but pipeline error: ${pipelineErr.message}`,
        fileName: fileName
      });
    }
    
  } catch (err) {
    console.error("❌ S3 upload error:", err);
    res.status(500).send(`Upload failed: ${err.message}`);
  }
});

// Endpoint to manually trigger AI pipeline with text input
app.post("/process-text", express.json(), async (req, res) => {
  try {
    const { text } = req.body;
    
    if (!text) {
      return res.status(400).json({ success: false, message: "Text input is required" });
    }
    
    console.log("🧠 Manual AI processing request received");
    console.log("📝 Input text:", text.substring(0, 100) + "...");
    
    // Process text with Granite LLM
    const aiResponse = await generateTextWithGranite(text);
    console.log("✅ AI processing completed");
    
    // Convert AI response to speech
    const speechResult = await synthesizeSpeech(aiResponse);
    
    if (speechResult.success) {
      res.json({
        success: true,
        inputText: text,
        aiResponse: aiResponse,
        audioFile: speechResult.relativePath,
        message: "Text processed and converted to speech successfully"
      });
    } else {
      res.status(500).json({
        success: false,
        error: speechResult.error,
        message: "AI processing succeeded but speech synthesis failed"
      });
    }
    
  } catch (error) {
    console.error("❌ Manual processing error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Endpoint to get pipeline status
app.get("/pipeline-status", (req, res) => {
  res.json({
    success: true,
    server: "Active",
    services: {
      transcription: "Available (AWS Transcribe)",
      ai: "Available (Watsonx Granite LLM)",
      speech: "Available (AWS Polly)",
    },
    pipeline: "Speech → Transcribe → AI → Speech",
    endpoints: {
      upload: "POST /upload-to-s3 (Complete pipeline)",
      processText: "POST /process-text (AI + Speech only)",
      deleteAudio: "POST /delete-audio",
      status: "GET /pipeline-status"
    }
  });
});

app.listen(Port, () => {
  console.log(Port);
  console.log(`🚀 AI Pipeline Server running on https://mindspaceai.onrender.com/`);
  console.log("🔄 Pipeline: Speech Input → Transcribe → Granite LLM → Speech Output");
  console.log("📡 Endpoints available:");
  console.log("   - POST /upload-to-s3 (Complete pipeline)");
  console.log("   - POST /process-text (Manual text processing)");
  console.log("   - POST /delete-audio (Delete audio files)");
  console.log("   - GET /pipeline-status (Check status)");
});