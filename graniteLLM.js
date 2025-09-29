require('dotenv').config();
const { WatsonXAI } = require('@ibm-cloud/watsonx-ai');

// IBM Watsonx.ai setup
process.env.IBM_CREDENTIALS_FILE = './.env';

const watsonxAIService = WatsonXAI.newInstance({
  version: '2024-05-31',
  serviceUrl: process.env.WATSONX_URL,
});

/**
 * Generate text using IBM Watsonx Granite LLM
 * @param {string} inputText - The input text/prompt for the LLM
 * @param {Object} options - Optional parameters for the LLM
 * @param {string} options.modelId - The model ID to use (default: 'ibm/granite-13b-instruct-v2')
 * @param {string} options.projectId - The Watson project ID (default from env or hardcoded)
 * @param {number} options.maxTokens - Maximum number of tokens to generate (default: 1000)
 * @returns {Promise<string>} - The generated text response
 */
async function generateTextWithGranite(inputText, options = {}) {
  try {
    // Validate input
    if (!inputText || typeof inputText !== 'string') {
      throw new Error('Input text is required and must be a string');
    }

    // Set default parameters (reduced maxTokens for better speech synthesis)
    const {
      modelId = 'ibm/granite-13b-instruct-v2',
      projectId = process.env.PROJECT_ID,
      maxTokens = 1000  // Reduced from 1000 to 300 for shorter, more concise responses
    } = options;

    // Add system prompt for mental health assistant with concise responses
    const systemPrompt = "You are a compassionate mental health assistant. Provide supportive, empathetic, and concise responses (2-3 sentences maximum) that can be easily converted to speech. Focus on being helpful and understanding while keeping responses brief and clear.";
    const formattedInput = `${systemPrompt}\n\nUser: ${inputText}\n\nAssistant:`;
    
    const watsonParams = {
      input: formattedInput,
      modelId: modelId,
      projectId: projectId,
      parameters: {
        max_new_tokens: maxTokens,
      },
    };

    console.log('🧠 Sending request to Watsonx Granite LLM...');
    console.log('📝 Input text:', inputText.substring(0, 100) + (inputText.length > 100 ? '...' : ''));
    
    // Generate text with Watsonx.ai
    const res = await watsonxAIService.generateText(watsonParams);
    const generatedText = res.result.results[0].generated_text;
    
    // console.log('✅ Watsonx.ai response received');
    // console.log('📄 Generated text:', generatedText.substring(0, 200) + (generatedText.length > 200 ? '...' : ''));
    
    return generatedText;
  } catch (err) {
    console.error('❌ Error during text generation:', err.message);
    throw new Error(`Watsonx Granite LLM error: ${err.message}`);
  }
}

// Export the function for use in other modules
module.exports = { generateTextWithGranite };

// Example usage (uncomment to test):
// generateTextWithGranite("I'm feeling really anxious about my upcoming exams. Can you help me calm down?")