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

    } catch (e: unknown) {
      // Detailed error logging
      const err = e as { response?: { promptFeedback?: { blockReason?: string } }; message?: string };
      const msg = err.response?.promptFeedback?.blockReason || err.message || JSON.stringify(e);
      throw new Error(`Gemini Generation Failed: ${msg}`);
    }
  }

  /**
   * Submit a batch job to Gemini Batch API
   * Returns the batch job name for polling
   */
  async submitBatchJob(
    requests: { ideaId: string; prompt: string; skill: string }[],
    templateImages: Buffer[] = []
  ): Promise<string> {
    // Build InlinedRequest array per SDK spec
    const inlinedRequests = requests.map((req) => {
      const systemInstruction = getSystemInstruction(req.skill);
      
      // Build parts with text prompt
      const parts: any[] = [{ text: req.prompt }];
      
      // Add template images if provided
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

      return {
        model: 'gemini-3-pro-image-preview', // Requires preview model for batch image gen
        contents: [{ role: 'user', parts: parts }],
        metadata: { ideaId: req.ideaId },
        config: {
          responseModalities: ['IMAGE' as const],
          systemInstruction: systemInstruction.parts,
        },
      };
    });
    
    // Submit to Batch API with inline requests
    const response = await this.client.batches.create({
      model: 'gemini-3-pro-image-preview',
      src: inlinedRequests,
    });
    
    if (!response.name) {
      throw new Error('Batch job creation failed - no name returned');
    }
    
    return response.name;
  }

  /**
   * Poll batch job status
   */
  async pollBatchJob(batchJobName: string): Promise<{
    state: string;
    completedCount?: number;
    failedCount?: number;
    incompleteCount?: number;
    error?: string;
  }> {
    const job = await this.client.batches.get({ name: batchJobName });
    
    const parseCount = (str?: string): number | undefined => {
      if (!str) return undefined;
      const n = parseInt(str, 10);
      return isNaN(n) ? undefined : n;
    };
    
    return {
      state: job.state || 'JOB_STATE_UNSPECIFIED',
      completedCount: parseCount(job.completionStats?.successfulCount),
      failedCount: parseCount(job.completionStats?.failedCount),
      incompleteCount: parseCount(job.completionStats?.incompleteCount),
      error: job.error?.message,
    };
  }

  /**
   * Get batch results from completed inline job
   * The SDK returns inlinedResponses for inline batch jobs
   */
  async getBatchResults(batchJobName: string): Promise<{
    ideaId: string;
    imageData?: string;
    error?: string;
  }[]> {
    const job = await this.client.batches.get({ name: batchJobName });
    
    // For inline requests, results come in inlinedResponses
    const responses = job.dest?.inlinedResponses || [];
    
    // Cast responses to access metadata - SDK types may not include it
    return responses.map((resp) => {
      // Access metadata via custom_id or request metadata
      const respAny = resp as { metadata?: Record<string, string>; response?: { candidates?: Array<{ content?: { parts?: Array<{ inlineData?: { data?: string } }> } }> }; error?: { message?: string } };
      const ideaId = respAny.metadata?.ideaId || '';
      const imageData = respAny.response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      const error = respAny.error?.message;
      
      return { ideaId, imageData, error };
    });
  }
}
