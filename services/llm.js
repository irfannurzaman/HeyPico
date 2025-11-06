import axios from 'axios';

const OPEN_WEBUI_URL = process.env.OPEN_WEBUI_BASE_URL || 'http://localhost:8080';
const OPEN_WEBUI_KEY = process.env.OPEN_WEBUI_API_KEY || '';

async function getAvailableModel() {
  try {
    let key = process.env.OPEN_WEBUI_API_KEY || OPEN_WEBUI_KEY;
    if (key) {
      key = key.replace(/^["']|["']$/g, '').trim();
    }
    
    const headers = { 'Content-Type': 'application/json' };
    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }
    
    const response = await axios.get(`${OPEN_WEBUI_URL}/api/v1/models`, {
      headers,
      timeout: 5000
    });
    
    if (response.data?.data?.length > 0) {
      const model = response.data.data.find(m => !m.arena) || response.data.data[0];
      return model.id || model.name;
    }
    
    return null;
  } catch (error) {
    console.error('Failed to get models:', error.message);
    return null;
  }
}

function extractPlaceInfo(text) {
  const info = {
    queries: [],
    locations: [],
    placeNames: []
  };

  const patterns = [
    /(?:find|search for|look for|where to|places to)\s+([^.!?]+)/gi,
    /(?:restaurants?|cafes?|hotels?|shops?|parks?|museums?)\s+(?:in|near|at)\s+([^.!?]+)/gi,
    /(?:best|good|popular)\s+([^.!?]+)\s+(?:in|near|at)\s+([^.!?]+)/gi
  ];

  patterns.forEach(pattern => {
    const matches = [...text.matchAll(pattern)];
    matches.forEach(match => {
      if (match[1]) info.queries.push(match[1].trim());
      if (match[2]) info.queries.push(match[2].trim());
    });
  });

  const namePattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  const nameMatches = [...text.matchAll(namePattern)];
  nameMatches.forEach(match => {
    const name = match[1];
    if (!['The', 'This', 'That', 'There', 'Here', 'You', 'Your'].includes(name)) {
      info.placeNames.push(name);
    }
  });

  return info;
}

export async function callLLM(prompt, conversationId = null) {
  try {
    const url = `${OPEN_WEBUI_URL}/api/v1/chat/completions`;
    
    let key = process.env.OPEN_WEBUI_API_KEY || OPEN_WEBUI_KEY;
    if (key) {
      key = key.replace(/^["']|["']$/g, '').trim();
    }
    
    const headers = { 'Content-Type': 'application/json' };

    if (key) {
      headers['Authorization'] = `Bearer ${key}`;
    }

    const messages = [
      {
        role: 'system',
        content: `You are a helpful assistant that helps users find places to visit, eat, or explore using Google Maps. 
When users ask about places (e.g., "where to go", "where to eat"), provide helpful suggestions with:
- Specific place names
- Place types (restaurants, cafes, parks, museums, etc.)
- General locations (neighborhoods, cities, areas)
- Location context and details

Your responses will be used to search Google Maps Places API, so be specific and clear about:
- What type of place the user is looking for
- Where they want to find it (city, neighborhood, area)

Format your responses naturally and include relevant details about the places you recommend.`
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    let model = process.env.LLM_MODEL;
    if (!model) {
      model = await getAvailableModel();
      if (!model) {
        throw new Error('No models available in Open WebUI. Connect a model in Settings → Connections.');
      }
    }
    
    const payload = {
      model: model,
      messages: messages,
      temperature: 0.7,
      max_tokens: 200,
      stream: false
    };

    if (conversationId) {
      payload.conversation_id = conversationId;
    }

    const timeout = parseInt(process.env.LLM_TIMEOUT_MS) || 300000;
    
    const response = await axios.post(url, payload, { headers, timeout });

    if (response.data?.choices?.length > 0) {
      const text = response.data.choices[0].message.content;
      const extractedInfo = extractPlaceInfo(text);

      return {
        success: true,
        text: text,
        extractedInfo: extractedInfo,
        conversationId: response.data.conversation_id || conversationId,
        model: response.data.model || payload.model
      };
    } else {
      throw new Error('Invalid response format from LLM');
    }

  } catch (error) {
    console.error('LLM API Error:', error.response?.data || error.message);
    
    if (error.code === 'ECONNREFUSED' || 
        error.response?.status === 404 || 
        error.response?.status === 401) {
      return {
        success: false,
        error: 'LLM service unavailable',
        message: error.response?.status === 401 
          ? 'Open WebUI requires authentication. Set OPEN_WEBUI_API_KEY in .env'
          : 'Open WebUI not running or not accessible. Check the URL.',
        fallback: true
      };
    }

    throw new Error(`LLM API error: ${error.response?.data?.error?.message || error.message}`);
  }
}

export function generateSearchQuery(llmResponse) {
  if (!llmResponse.success || !llmResponse.extractedInfo) {
    return null;
  }

  const { queries, placeNames } = llmResponse.extractedInfo;
  
  if (queries.length > 0) {
    return queries[0];
  }

  if (placeNames.length > 0) {
    return placeNames.join(' ');
  }

  const text = llmResponse.text;
  const patterns = [
    /(?:restaurants?|cafes?|hotels?|shops?|parks?|museums?|attractions?)/gi,
    /(?:in|near|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}
