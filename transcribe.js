require("dotenv").config();
const {
  TranscribeClient,
  StartTranscriptionJobCommand,
  GetTranscriptionJobCommand
} = require("@aws-sdk/client-transcribe");
const {
  S3Client,
  GetObjectCommand,
  PutObjectCommand
} = require("@aws-sdk/client-s3");
const { Readable } = require("stream");

// Initialize AWS clients
const transcribeClient = new TranscribeClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  }
});

const s3Client = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sessionToken: process.env.AWS_SESSION_TOKEN,
  }
});

const bucketName = "mint-bucket1";

const startTranscription = async (jobName, audioFile) => {
  const params = {
    TranscriptionJobName: jobName,
    LanguageCode: "en-US",
    MediaFormat: "mp3",
    Media: {
      MediaFileUri: `s3://${bucketName}/${audioFile}`
    },
    OutputBucketName: bucketName
  };

  const command = new StartTranscriptionJobCommand(params);
  const response = await transcribeClient.send(command);
  // console.log("Transcription started:", response.TranscriptionJob.TranscriptionJobName);
};

// Poll until job completes
const waitForCompletion = async (jobName) => {
  while (true) {
    const command = new GetTranscriptionJobCommand({ TranscriptionJobName: jobName });
    const response = await transcribeClient.send(command);
    const status = response.TranscriptionJob.TranscriptionJobStatus;

    if (status === "COMPLETED") {
      // console.log("Transcription completed.");
      return response.TranscriptionJob.Transcript.TranscriptFileUri;
    } else if (status === "FAILED") {
      throw new Error("Transcription job failed.");
    }
    await new Promise(resolve => setTimeout(resolve, 100)); // Wait 0.1 seconds
  }
};

// Download transcript from S3, extract text, and save as text file
const getTranscriptText = async (jobName) => {
  // First, get the JSON file that AWS Transcribe creates
  const jsonKey = `${jobName}.json`;
  const getJsonCommand = new GetObjectCommand({
    Bucket: bucketName,
    Key: jsonKey
  });

  const jsonResponse = await s3Client.send(getJsonCommand);
  const jsonStream = jsonResponse.Body;
  const jsonData = await streamToString(jsonStream);
  const json = JSON.parse(jsonData);
  const text = json.results.transcripts.map(t => t.transcript).join("\n");
  
  // Now save only the text as a .txt file
  const textKey = `${jobName}.txt`;
  const putTextCommand = new PutObjectCommand({
    Bucket: bucketName,
    Key: textKey,
    Body: text,
    ContentType: 'text/plain'
  });
  
  await s3Client.send(putTextCommand);
  console.log(`Text file saved to S3: s3://${bucketName}/${textKey}`);
  // console.log("Transcribed text:", text);
  
  return text;
};

// Helper to convert stream to string
const streamToString = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
};

// Main transcription function that takes an MP3 file as parameter
const transcribeAudio = async (mp3FileName) => {
  try {
    const jobName = `MyTranscriptionJob-${Date.now()}`;
    await startTranscription(jobName, mp3FileName);
    const transcriptUri = await waitForCompletion(jobName);
    const transcriptText = await getTranscriptText(jobName);
    return transcriptText;
  } catch (err) {
    console.error("Error:", err);
    throw err;
  }
};

// Export the function for use in other modules
module.exports = { transcribeAudio };

// Example usage (uncomment to test):
// transcribeAudio("polly-output2.mp3").then(result => {
//   console.log("Transcription result:", result);
// });
