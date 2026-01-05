import { GoogleGenAI } from '@google/genai';
import { getSystemInstruction } from './prompts';




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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        config,
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          imageConfig: {
            imageSize: '4K',
             negativePrompt: "frame, border, rectangle, square, box, page border, edge to edge, full bleed, cropping, text, watermark, logo, signature, solid black, filled shapes, heavy shadow, silhouette, dark background"
          },
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
   * Poll batch job status using REST API with streaming partial parsing
   * This extracts status fields from the start of the JSON response without loading the full response
   */
  async pollBatchJob(batchJobName: string): Promise<{
    state: string;
    completedCount?: number;
    failedCount?: number;
    incompleteCount?: number;
    error?: string;
  }> {
    // Use REST API with streaming to extract status fields early
    // The SDK's batches.get() loads everything including huge base64 images
    const apiKey = (this.client as unknown as { apiKey: string }).apiKey;
    const url = `https://generativelanguage.googleapis.com/v1beta/${batchJobName}?key=${apiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to poll batch job: ${response.status} ${errorText}`);
    }
    
    // Stream the response and extract just the fields we need from the start
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body available');
    }
    
    const decoder = new TextDecoder();
    let accumulated = '';
    const MAX_CHARS = 100000; // Status fields should be in first ~100KB, before the image data
    
    // Read chunks until we find completionStats or hit limit
    let done = false;
    while (!done && accumulated.length < MAX_CHARS) {
      const result = await reader.read();
      done = result.done;
      if (done || !result.value) break;
      accumulated += decoder.decode(result.value, { stream: true });
    }
    
    // Cancel the rest of the stream - we don't need the image data for status check
    reader.cancel();
    
    // Extract fields using regex since we have partial JSON
    // The state field might be at the end of the response, so check for inlinedResponses as success indicator
    const stateMatch = accumulated.match(/"state"\s*:\s*"([^"]+)"/);
    const successMatch = accumulated.match(/"successfulCount"\s*:\s*"?(\d+)"?/);
    const failedMatch = accumulated.match(/"failedCount"\s*:\s*"?(\d+)"?/);
    const incompleteMatch = accumulated.match(/"incompleteCount"\s*:\s*"?(\d+)"?/);
    const errorMatch = accumulated.match(/"error"\s*:\s*\{[^}]*"message"\s*:\s*"([^"]+)"/);
    
    // If we see inlinedResponses with actual data, the job has completed successfully
    const hasInlinedData = accumulated.includes('"inlinedResponses"') && accumulated.includes('"data"');
    
    // Determine state - if we have inlined data but no explicit state, assume SUCCEEDED
    let state = stateMatch?.[1];
    if (!state && hasInlinedData) {
      state = 'JOB_STATE_SUCCEEDED';
    }
    
    const parseCount = (match: RegExpMatchArray | null): number | undefined => {
      if (!match) return undefined;
      const n = parseInt(match[1], 10);
      return isNaN(n) ? undefined : n;
    };
    
    return {
      state: state || 'JOB_STATE_UNSPECIFIED',
      completedCount: parseCount(successMatch),
      failedCount: parseCount(failedMatch),
      incompleteCount: parseCount(incompleteMatch),
      error: errorMatch?.[1],
    };
  }

  /**
   * Get batch results from completed inline job
   * Uses streaming to handle very large responses that exceed Node.js string limits
   */
  async getBatchResults(batchJobName: string): Promise<{
    ideaId: string;
    imageData?: string;
    error?: string;
  }[]> {
    const apiKey = (this.client as unknown as { apiKey: string }).apiKey;
    
    // Fetch the full batch job response using streams to handle large payloads
    // We need the dest.inlinedResponses which contains the image data
    const url = `https://generativelanguage.googleapis.com/v1beta/${batchJobName}?key=${apiKey}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get batch results: ${response.status} ${errorText}`);
    }
    
    // For very large responses, we'll stream and process chunks
    // However, JSON parsing still needs the full string, so for now we'll
    // try a chunked approach that saves results as we parse them
    
    // Read the response as a stream of ArrayBuffer chunks
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body available');
    }
    
    const chunks: Uint8Array[] = [];
    let totalSize = 0;
    const MAX_SAFE_SIZE = 400 * 1024 * 1024; // 400MB to be safe below 512MB limit
    
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (done || !result.value) break;
      
      totalSize += result.value.byteLength;
      
      // If we're getting too large, we need to abort and use a different strategy
      if (totalSize > MAX_SAFE_SIZE) {
        reader.cancel();
        throw new Error(`Batch response too large (${Math.round(totalSize / 1024 / 1024)}MB). Consider using file-based batch output instead of inline responses for large batches with 4K images.`);
      }
      
      chunks.push(result.value);
    }
    
    // Concatenate all chunks
    const fullBuffer = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
      fullBuffer.set(chunk, offset);
      offset += chunk.byteLength;
    }
    
    // Decode and parse
    const decoder = new TextDecoder();
    const jsonString = decoder.decode(fullBuffer);
    
    interface BatchJobResponse {
      // Old SDK structure (keeping for compatibility)
      dest?: {
        inlinedResponses?: Array<{
          metadata?: Record<string, string>;
          response?: {
            candidates?: Array<{
              content?: {
                parts?: Array<{
                  inlineData?: { data?: string };
                }>;
              };
            }>;
          };
          error?: { message?: string };
        }>;
      };
      // Actual REST API structure (metadata.output.inlinedResponses.inlinedResponses)
      metadata?: {
        output?: {
          inlinedResponses?: {
            inlinedResponses?: Array<{
              metadata?: Record<string, string>;
              response?: {
                candidates?: Array<{
                  content?: {
                    parts?: Array<{
                      inlineData?: { data?: string };
                    }>;
                  };
                }>;
              };
              error?: { message?: string };
            }>;
          };
        };
      };
    }
    
    const job = JSON.parse(jsonString) as BatchJobResponse;
    
    // Try both response structures - REST API uses metadata.output path
    const responses = 
      job.metadata?.output?.inlinedResponses?.inlinedResponses ||
      job.dest?.inlinedResponses || 
      [];
    
    console.log('[DEBUG getBatchResults] Found', responses.length, 'responses');
    
    // Cast responses to access metadata - SDK types may not include it
    return responses.map((resp) => {
      const ideaId = resp.metadata?.ideaId || '';
      const imageData = resp.response?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      const error = resp.error?.message;
      
      return { ideaId, imageData, error };
    });
  }
}
