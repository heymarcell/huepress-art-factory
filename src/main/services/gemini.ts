import { GoogleGenAI } from '@google/genai';
import { SYSTEM_INSTRUCTION } from './prompts';


interface GenerationParams {
  width?: number;
  height?: number;
}

export class GeminiService {
  private client: GoogleGenAI;

  constructor(apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  async generateImage(
    userInput: string,
    onProgress?: (text: string) => void
  ): Promise<Buffer> {
    // User insisted on this specific model
    const model = 'gemini-3-pro-image-preview';

    // Log start
    if (onProgress) onProgress('Initializing image generation with Gemini...');

    // Tools setup per user snippet
    const tools = [
      {
        googleSearch: {}
      },
    ];

    // Config setup per user snippet
    const config = {
      temperature: 0.95,
      responseModalities: ['IMAGE', 'TEXT'],
      // mediaResolution: 'MEDIA_RESOLUTION_HIGH', // Input-only param, likely causing error on text-only requests
      imageConfig: {
        imageSize: '4K',
      },
      tools,
      systemInstruction: SYSTEM_INSTRUCTION.parts,
    };

    const contents = [
      {
        role: 'user',
        parts: [{ text: userInput }]
      }
    ];

    try {
      // Using generateContentStream allows catching errors early and potential text feedback
      // Cast config to any to avoid type issues with newer fields like imageConfig
      const response = await this.client.models.generateContentStream({
        model,
        contents,
        config: config as any,
      });

      for await (const chunk of response) {
        // Check for inline image data (standard Gemini format)
        if (chunk.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
          const inlineData = chunk.candidates[0].content.parts[0].inlineData;
          const data = inlineData.data || '';
          return Buffer.from(data, 'base64');
        }
        
        // Also check prompt feedback for blocks
        if (chunk.promptFeedback?.blockReason) {
             throw new Error(`Blocked: ${chunk.promptFeedback.blockReason}`);
        }
       
        // Check for text progress/thoughts
        const text = chunk.text ? chunk.text : chunk.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && onProgress) {
            onProgress(text);
        }
      }
      
      throw new Error('No image generated in response stream. Model may have returned text instead.');

    } catch (e: any) {
      // Detailed error logging
      const msg = e.response?.promptFeedback?.blockReason || e.message || JSON.stringify(e);
      throw new Error(`Gemini Generation Failed: ${msg}`);
    }
  }
}
