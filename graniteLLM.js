require('dotenv').config();
const { WatsonXAI } = require('@ibm-cloud/watsonx-ai');
const { IamAuthenticator } = require('ibm-cloud-sdk-core');

// Build client config using environment variables
const config = {
  authenticator: new IamAuthenticator({ apikey: process.env.WATSONX_AI_APIKEY }),
  serviceUrl: process.env.WATSONX_AI_URL,
  version: '2024-05-31',
};

let watsonxAI;
try {
  // Instantiate the client using the SDK constructor
  watsonxAI = new WatsonXAI(config);
} catch (e) {
  watsonxAI = null;
}

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
    // Use requested options or sensible defaults per user snippet
    const params = {
      input: inputText,
      modelId: options.modelId || process.env.WATSONX_AI_MODEL_ID || 'ibm/granite-3-3-8b-instruct',
      projectId: options.projectId || process.env.WATSONX_AI_PROJECT_ID || process.env.WATSONX_AI_PROJECT_ID,
      parameters: {
        max_new_tokens: (options.max_new_tokens || 100),
        temperature: (options.temperature ?? 0.7),
        top_p: (options.top_p ?? 0.9),
      },
    };

    if (!watsonxAI) throw new Error('Watsonx client not initialized. Ensure WATSONX_AI_APIKEY and WATSONX_AI_URL are set.');

    console.log('🧠 Sending request to Watsonx Granite LLM...');
    console.log('📝 Prompt preview:', inputText.substring(0, 120) + (inputText.length > 120 ? '...' : ''));

    const response = await watsonxAI.generateText(params);

    if (response && response.result && Array.isArray(response.result.results) && response.result.results.length) {
      return response.result.results[0].generated_text.trim();
    }

    // fallback shapes
    if (response && response.result && response.result.generations && response.result.generations[0]) {
      return (response.result.generations[0].text || '').trim();
    }

    return 'No result field in response';
  } catch (err) {
    console.error('❌ Error during text generation:', err.message);
    throw new Error(`Watsonx Granite LLM error: ${err.message}`);
  }
}

// Export the function for use in other modules
module.exports = { generateTextWithGranite };

// Example usage when run directly
// generateTextWithGranite("Explain the theory of relativity in simple terms.")