require('dotenv').config();
const { PollyClient, SynthesizeSpeechCommand } = require('@aws-sdk/client-polly');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const { pipeline } = require('stream');
const { promisify } = require('util');

const pipe = promisify(pipeline);

const polly = new PollyClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

// Create aud_op directory if it doesn't exist
const audioOutputDir = path.join(__dirname, 'public/aud_op');
if (!fs.existsSync(audioOutputDir)) {
  fs.mkdirSync(audioOutputDir, { recursive: true });
  console.log('📁 Created public/aud_op directory');
}

// Function to clear previous audio files from aud_op folder
function clearPreviousAudio() {
  try {
    const files = fs.readdirSync(audioOutputDir);
    files.forEach(file => {
      if (file.endsWith('.mp3')) {
        const filePath = path.join(audioOutputDir, file);
        fs.unlinkSync(filePath);
        console.log(`🗑️ Deleted previous audio: ${file}`);
      }
    });
  } catch (err) {
    console.error('⚠️ Error clearing previous audio files:', err.message);
  }
}

// Function to truncate text to fit Polly limits
function truncateTextForPolly(text, maxLength = 2500) {
  if (text.length <= maxLength) {
    return text;
  }
  
  // Try to truncate at sentence boundaries
  const truncated = text.substring(0, maxLength);
  const lastSentenceEnd = Math.max(
    truncated.lastIndexOf('.'),
    truncated.lastIndexOf('!'),
    truncated.lastIndexOf('?')
  );
  
  if (lastSentenceEnd > maxLength * 0.7) {
    // If we found a sentence ending in the last 30% of the text, use it
    return truncated.substring(0, lastSentenceEnd + 1);
  } else {
    // Otherwise, truncate at word boundary
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 0) {
      return truncated.substring(0, lastSpace) + '...';
    } else {
      return truncated + '...';
    }
  }
}

// Function to synthesize speech from text input, save to aud_op folder AND upload to S3
async function synthesizeSpeech(textInput, options = {}) {
  // Set default options
  const defaultOptions = {
    voiceId: 'Joanna',
    outputFormat: 'mp3',
    outputFileName: 'current_audio.mp3', // Fixed filename for easy HTML embedding
    bucketName: 'mint-out' // S3 bucket name
  };
  
  const config = { ...defaultOptions, ...options };
  
  // Truncate text if it's too long for Polly
  const processedText = truncateTextForPolly(textInput);
  if (processedText !== textInput) {
    console.log(`⚠️ Text truncated from ${textInput.length} to ${processedText.length} characters for Polly`);
  }
  
  const params = {
    OutputFormat: config.outputFormat,
    Text: processedText,
    VoiceId: config.voiceId,
  };

  try {
    console.log('🎤 Synthesizing speech...');
    console.log('📝 Original text length:', textInput.length);
    console.log('📝 Processed text length:', processedText.length);
    console.log('📝 Text preview:', processedText.substring(0, 100) + (processedText.length > 100 ? '...' : ''));
    console.log('🗣️ Voice:', config.voiceId);
    console.log('📁 Output folder: public/aud_op');
    console.log('🪣 S3 Bucket:', config.bucketName);
    // Clear previous audio files
    clearPreviousAudio();
    
    const command = new SynthesizeSpeechCommand(params);
    const response = await polly.send(command);
    
    // Convert the audio stream to a buffer (needed for both local save and S3 upload)
    const chunks = [];
    for await (const chunk of response.AudioStream) {
      chunks.push(chunk);
    }
    const audioBuffer = Buffer.concat(chunks);
    
    // 1. Save to aud_op folder locally
    const localFilePath = path.join(audioOutputDir, config.outputFileName);
    fs.writeFileSync(localFilePath, audioBuffer);
    console.log(`✅ Speech saved locally to: ${localFilePath}`);
    
    // 2. Upload to S3
    const s3FileName = `polly-output-${Date.now()}.mp3`; // Unique filename for S3
    const uploadParams = {
      Bucket: config.bucketName,
      Key: s3FileName,
      Body: audioBuffer,
      ContentType: 'audio/mpeg',
    };
    
    await s3.send(new PutObjectCommand(uploadParams));
    console.log(`✅ Speech uploaded to S3: s3://${config.bucketName}/${s3FileName}`);
    
    // console.log(`🎵 Ready for HTML audio tag: <audio src="aud_op/${config.outputFileName}" controls></audio>`);
    
    return {
      success: true,
      localFileName: config.outputFileName,
      localFilePath: localFilePath,
      relativePath: `public/aud_op/${config.outputFileName}`,
      s3FileName: s3FileName,
      bucketName: config.bucketName,
      s3Url: `s3://${config.bucketName}/${s3FileName}`,
      message: `Speech synthesized, saved locally to aud_op folder AND uploaded to S3 successfully`
    };
  } catch (err) {
    console.error('❌ Polly synthesis, local save, or S3 upload failed:', err);
    return {
      success: false,
      error: err.message
    };
  }
}

// Export the function for use in other modules
module.exports = { synthesizeSpeech };


  // synthesizeSpeech("halwa made in electric cooker by hulk is an electric type pokemon")
//    console.log("Result:", result);
// });

// Example with custom bucket and filename:
// synthesizeSpeech("Hello world!", { 
//   bucketName: 'my-custom-bucket', 
//   outputFileName: 'custom-audio.mp3' 
// }).then(result => {
//   console.log("Result:", result);
// });
