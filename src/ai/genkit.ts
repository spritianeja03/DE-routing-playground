import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/googleai';

const GOOGLE_API_KEY = process.env.GOOGLE_AI_API_KEY;

if (!GOOGLE_API_KEY) {
  console.warn(
    'GOOGLE_AI_API_KEY environment variable not found. ' +
    'Please create a .env file in the root directory and add GOOGLE_AI_API_KEY="YOUR_API_KEY_HERE", ' +
    'or set the environment variable in your deployment environment. ' +
    'The application might not function correctly without it.'
  );
  // For stricter local development, you could uncomment the line below to throw an error:
  // throw new Error('CRITICAL: GOOGLE_AI_API_KEY is not set. Application cannot start.');
}

export const ai = genkit({
  plugins: [
    googleAI({ apiKey: GOOGLE_API_KEY }) // The googleAI plugin will use this key.
                                        // If undefined, it might try default env vars or fail.
  ],
  model: 'googleai/gemini-2.0-flash', // Using the model name you specified
});
