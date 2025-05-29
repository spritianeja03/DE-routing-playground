import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';

export const ai = genkit({
  plugins: [googleAI({ apiKey: "AIzaSyA9Xn2frC1rvH1T4WHZjg02-odTJ0cfH0g" })],
  model: 'googleai/gemini-2.0-flash',
});
