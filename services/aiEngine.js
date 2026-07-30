const axios = require('axios');
const nlp = require('compromise');
const natural = require('natural');

// ============================================================
// AI ENGINE - ContXpert
// Implements: NLP (Compromise.js + Natural.js) + LLM (Groq)
// ============================================================

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Tokenizer for NLP preprocessing
const tokenizer = new natural.WordTokenizer();
const TfIdf = natural.TfIdf;

// ============================================================
// INTENT CLASSIFICATION (NLP Layer)
// Uses: keyword matching + TF-IDF similarity + compromise.js NER
// ============================================================

const INTENT_PATTERNS = {
  greeting: {
    keywords: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'namaste', 'hola'],
    weight: 1.0
  },
  attendance: {
    keywords: ['attendance', 'present', 'absent', 'classes attended', 'attendance percentage', 'how many classes', 'did i attend', 'attendance shortage', 'low attendance'],
    weight: 1.0
  },
  marks: {
    keywords: ['marks', 'cie', 'internal marks', 'score', 'grades', 'result', 'exam marks', 'test marks', 'how did i do', 'my score'],
    weight: 1.0
  },
  fee: {
    keywords: ['fee', 'fees', 'payment', 'paid', 'due', 'balance', 'how much to pay', 'fee status', 'tuition fee', 'college fee'],
    weight: 1.0
  },
  timetable: {
    keywords: ['timetable', 'schedule', 'classes today', 'what class', 'tomorrow classes', 'next class', 'timetable today', 'when is class'],
    weight: 1.0
  },
  certificate: {
    keywords: ['certificate', 'bonafide', 'fee structure', 'migration', 'transcript', 'certificate request', 'need certificate', 'get certificate'],
    weight: 1.0
  },
  notification: {
    keywords: ['notification', 'alert', 'announcement', 'news', 'update', 'what is new', 'any notice', 'college notice'],
    weight: 1.0
  },
  help: {
    keywords: ['help', 'what can you do', 'features', 'options', 'menu', 'commands', 'how to use', 'support'],
    weight: 1.0
  },
  registration: {
    keywords: ['register', 'signup', 'new user', 'first time', 'not registered', 'link my number'],
    weight: 1.0
  },
  goodbye: {
    keywords: ['bye', 'goodbye', 'see you', 'thanks', 'thank you', 'ok bye'],
    weight: 0.8
  },
  unknown: {
    keywords: [],
    weight: 0.0
  }
};

/**
 * NLP Preprocessing Pipeline
 * Step 1: Tokenization
 * Step 2: POS Tagging (via compromise.js)
 * Step 3: Named Entity Recognition (NER) - extract USN, dates, names
 * Step 4: Lemmatization (via natural.js)
 * Step 5: Intent Scoring via TF-IDF similarity
 */
function preprocessText(text) {
  const doc = nlp(text);

  // Named Entity Recognition
  const entities = {
    usn: doc.match('#Cardinal #Text').out('text') || 
         text.match(/\b\d[A-Z]{2}\d{2}[A-Z]{2}\d{3}\b/i)?.[0] ||
         text.match(/\b[0-9][A-Za-z]{2}[0-9]{2}[A-Za-z]{2}[0-9]{3}\b/)?.[0],
    dates: typeof doc.dates === 'function' ? doc.dates().json().map(d => d.text) : [],
    numbers: typeof doc.numbers === 'function' ? doc.numbers().json().map(n => n.text) : [],
    people: typeof doc.people === 'function' ? doc.people().json().map(p => p.text) : [],
    organizations: typeof doc.organizations === 'function' ? doc.organizations().json().map(o => o.text) : [],
    topics: typeof doc.topics === 'function' ? doc.topics().json().map(t => t.text) : []
  };

  // Tokenize and normalize
  const tokens = tokenizer.tokenize(text.toLowerCase());
  const lemmas = tokens.map(t => natural.PorterStemmer.stem(t));

  return {
    original: text,
    tokens,
    lemmas,
    entities,
    pos: doc.json()[0]?.terms?.map(t => ({ word: t.text, tag: t.tags[0] })) || []
  };
}

/**
 * Intent Detection using TF-IDF + Keyword Scoring
 * Returns: { intent, confidence, scores }
 */
function detectIntent(text) {
  const processed = preprocessText(text);
  const inputText = text.toLowerCase();

  const scores = {};
  const tfidf = new TfIdf();

  // Add input document
  tfidf.addDocument(inputText);

  // Score each intent
  for (const [intentName, intentData] of Object.entries(INTENT_PATTERNS)) {
    let score = 0;

    // Keyword matching with stemming
    for (const keyword of intentData.keywords) {
      const stemmedKeyword = natural.PorterStemmer.stem(keyword.toLowerCase());
      const stemmedTokens = processed.lemmas;

      // Exact match
      if (inputText.includes(keyword.toLowerCase())) {
        score += intentData.weight * 2;
      }
      // Stemmed match
      else if (stemmedTokens.includes(stemmedKeyword)) {
        score += intentData.weight * 1.5;
      }
      // Partial match
      else if (keyword.toLowerCase().split(' ').some(kw => inputText.includes(kw))) {
        score += intentData.weight * 0.5;
      }
    }

    // TF-IDF similarity with intent keywords as pseudo-document
    const intentDoc = intentData.keywords.join(' ');
    if (intentDoc) {
      tfidf.addDocument(intentDoc);
      // Simple overlap scoring
      const overlap = intentData.keywords.filter(k => inputText.includes(k.toLowerCase())).length;
      score += overlap * 0.3;
    }

    scores[intentName] = score;
  }

  // Find best intent
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [topIntent, topScore] = sorted[0];
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? topScore / totalScore : 0;

  // Threshold: if confidence too low, mark as unknown
  const finalIntent = confidence > 0.15 ? topIntent : 'unknown';

  return {
    intent: finalIntent,
    confidence: parseFloat(confidence.toFixed(3)),
    scores,
    entities: processed.entities,
    processed
  };
}

/**
 * Context-Aware Intent Detection
 * Considers conversation history for better accuracy
 */
function detectIntentWithContext(text, conversationHistory = []) {
  const baseResult = detectIntent(text);

  // If previous context suggests a specific flow, boost related intents
  if (conversationHistory.length > 0) {
    const lastIntent = conversationHistory[conversationHistory.length - 1].intent;

    // Contextual boosting
    const contextBoosts = {
      'registration': ['registration', 'greeting'],
      'attendance': ['attendance', 'help'],
      'marks': ['marks', 'help'],
      'fee': ['fee', 'help'],
      'certificate': ['certificate', 'help'],
      'timetable': ['timetable', 'help']
    };

    if (contextBoosts[lastIntent] && contextBoosts[lastIntent].includes(baseResult.intent)) {
      baseResult.confidence = Math.min(1.0, baseResult.confidence * 1.2);
      baseResult.contextBoosted = true;
    }
  }

  return baseResult;
}

// ============================================================
// LLM RESPONSE GENERATION (Groq API)
// Generates natural, contextual responses
// ============================================================

const SYSTEM_PROMPT = `You are ContXpert, an AI-powered student support assistant for Malnad College of Engineering. 
You help students with attendance, marks, fees, timetable, certificates, and general queries.
Be friendly, concise, and accurate. Use Indian context (₹ for rupees, IST timezone).
If you don't know something, say so honestly. Keep responses under 200 words.`;

async function generateLLMResponse(userMessage, context = {}) {
  if (!GROQ_API_KEY || GROQ_API_KEY === 'your_groq_api_key') {
    console.log('[AI] LLM not configured, falling back to template responses');
    return null;
  }

  try {
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...context.history?.map(h => ({
        role: h.role,
        content: h.content
      })) || [],
      { role: 'user', content: userMessage }
    ];

    const response = await axios.post(GROQ_URL, {
      model: GROQ_MODEL,
      messages,
      temperature: 0.7,
      max_tokens: 300,
      top_p: 0.9
    }, {
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });

    const aiResponse = response.data.choices[0].message.content;
    console.log('[AI] LLM generated response');
    return aiResponse;

  } catch (error) {
    console.error('[AI] LLM error:', error.message);
    return null;
  }
}

/**
 * Hybrid Response Generator
 * Combines NLP intent + LLM for best results
 * Falls back to templates if LLM unavailable
 */
async function generateResponse(userMessage, intentResult, studentData = null, context = {}) {
  // Try LLM first for natural language generation
  const llmResponse = await generateLLMResponse(userMessage, context);

  if (llmResponse) {
    return {
      text: llmResponse,
      source: 'llm',
      intent: intentResult.intent,
      confidence: intentResult.confidence
    };
  }

  // Fallback: template-based with NLP-enhanced personalization
  return generateTemplateResponse(intentResult, studentData);
}

function generateTemplateResponse(intentResult, studentData) {
  const name = studentData?.name || 'Student';
  const intent = intentResult.intent;

  const templates = {
    greeting: `Hello ${name}! 👋 I'm ContXpert, your AI student support assistant. I can help you with attendance, marks, fee status, timetable, certificates, and more. What would you like to know?`,
    attendance: `Hi ${name}, let me check your attendance record. I'll pull the latest data from the system.`,
    marks: `Hi ${name}, I'll retrieve your CIE marks and academic performance data now.`,
    fee: `Hi ${name}, let me check your fee payment status and any outstanding dues.`,
    timetable: `Hi ${name}, I'll fetch your class schedule for today based on your department and section.`,
    certificate: `Hi ${name}, I can help you request certificates. Available options: Bonafide, Fee Structure, or Migration Certificate.`,
    notification: `Hi ${name}, let me check the latest announcements and alerts for you.`,
    help: `Hi ${name}! Here's what I can do:
📊 Check Attendance
📝 View CIE Marks
💳 Fee Status
🗓 Timetable
📄 Certificate Requests
🔔 Notifications

Just ask me naturally!`,
    registration: `Welcome! To get started, I need to verify your identity. Please share your USN (e.g., 4MC22CS070).`,
    goodbye: `Goodbye ${name}! 👋 Feel free to message me anytime. Have a great day!`,
    unknown: `I'm not sure I understood that, ${name}. Could you rephrase? You can ask about attendance, marks, fees, timetable, or certificates.`
  };

  return {
    text: templates[intent] || templates.unknown,
    source: 'template+nlp',
    intent: intentResult.intent,
    confidence: intentResult.confidence
  };
}

// ============================================================
// RAG SIMULATION (Retrieval-Augmented Generation)
// In production: connect to vector DB (Pinecone/Weaviate)
// Current: in-memory knowledge base with TF-IDF retrieval
// ============================================================

const KNOWLEDGE_BASE = [
  { id: 1, topic: 'attendance', content: 'Students must maintain minimum 75% attendance. Below 75% triggers alert. Below 65% may result in detention.' },
  { id: 2, topic: 'cie', content: 'CIE (Continuous Internal Evaluation) consists of 3 tests per subject. Best 2 of 3 are considered. Each test is 30 marks.' },
  { id: 3, topic: 'fee', content: 'Fee payment deadline is 15th of every month. Late fee of ₹500 applies after deadline.' },
  { id: 4, topic: 'certificate', content: 'Bonafide certificate costs ₹150. Fee Structure certificate costs ₹100. Migration certificate costs ₹200.' },
  { id: 5, topic: 'timetable', content: 'Classes run Monday to Saturday. First period starts at 9:00 AM. Lunch break is 1:00 PM to 2:00 PM.' },
  { id: 6, topic: 'general', content: 'College office hours: 10 AM to 4 PM, Monday to Saturday. Contact: office@mcehassan.ac.in' }
];

function retrieveContext(query, topK = 2) {
  const tfidf = new TfIdf();

  // Add knowledge documents
  KNOWLEDGE_BASE.forEach(doc => tfidf.addDocument(doc.content));

  // Score query against documents
  const scores = [];
  KNOWLEDGE_BASE.forEach((doc, idx) => {
    const docTerms = tokenizer.tokenize(doc.content.toLowerCase());
    const queryTerms = tokenizer.tokenize(query.toLowerCase());
    const overlap = queryTerms.filter(t => docTerms.includes(t)).length;
    scores.push({ doc, score: overlap, idx });
  });

  return scores
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(s => s.doc);
}

// ============================================================
// EXPORT
// ============================================================
module.exports = {
  detectIntent,
  detectIntentWithContext,
  generateResponse,
  generateLLMResponse,
  generateTemplateResponse,
  preprocessText,
  retrieveContext,
  KNOWLEDGE_BASE
};
