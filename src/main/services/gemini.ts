import { GoogleGenAI } from '@google/genai';
import { getSystemInstruction } from './prompts';


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
    onProgress?: (text: string) => void,
    templateImages: Buffer[] = []
  ): Promise<Buffer> {
    const model = 'gemini-3-pro-image-preview';
    
    // Tools configuration (Google Search etc - disabled for image gen usually, but kept if needed)
    const tools = [
      { googleSearch: {} }
    ];

    // Parse user input to find skill
    let skill = 'Medium';
    try {
      const parsed = JSON.parse(userInput.split('\n\n')[0]); // Handle appended negative prompt
      if (parsed.skill) skill = parsed.skill;
    } catch (e) {
      // ignore
    }

    const systemInstruction = getSystemInstruction(skill);

    // Build parts
    const parts: any[] = [{ text: userInput }];
    
    if (templateImages && templateImages.length > 0) {
      templateImages.forEach(img => {
        parts.push({
          inlineData: {
            mimeType: 'image/png',
            data: img.toString('base64')
          }
        });
      });
    }

    const config = {
      responseModalities: ['IMAGE'],
      imageConfig: {
        imageSize: '4K',
        // Attempting to pass negative prompt if supported by the underlying model pipeline
        // @ts-ignore - The SDK types might not match the specific model capabilities
        negativePrompt: "frame, border, rectangle, square, box, page border, edge to edge, full bleed, cropping, text, watermark, logo, signature, solid black, filled shapes, heavy shadow, silhouette, dark background"
      },
      // tools, // Tools often conflict with image generation models, disabling for safety unless needed
      systemInstruction: systemInstruction.parts,
    };

    const contents = [
      {
        role: 'user',
        parts: parts
      }
    ];

    try {
      // Using generateContentStream allows catching errors early and potential text feedback
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
