
const { GoogleGenAI } = require('@google/genai');

try {
  const client = new GoogleGenAI({ apiKey: 'TEST' });
  console.log('client keys:', Object.keys(client));
  console.log('client.models keys:', Object.keys(client.models));
  if (client.models.generateImage) console.log('Has generateImage');
  if (client.models.generateImages) console.log('Has generateImages');
  
} catch (e) {
  console.error(e);
}
