const { detectIntent, detectIntentWithContext, preprocessText, retrieveContext } = require('../services/aiEngine');

console.log('🧪 ContXpert AI Engine Test\n');
console.log('='.repeat(60));

const testCases = [
  { text: 'hi', expected: 'greeting' },
  { text: 'hello there', expected: 'greeting' },
  { text: 'namaste', expected: 'greeting' },
  { text: 'show my attendance', expected: 'attendance' },
  { text: 'how many classes did i miss', expected: 'attendance' },
  { text: 'attendance percentage', expected: 'attendance' },
  { text: 'my marks', expected: 'marks' },
  { text: 'cie scores', expected: 'marks' },
  { text: 'how did i do in exams', expected: 'marks' },
  { text: 'fee status', expected: 'fee' },
  { text: 'how much do i owe', expected: 'fee' },
  { text: 'timetable today', expected: 'timetable' },
  { text: 'what class do i have now', expected: 'timetable' },
  { text: 'bonafide certificate', expected: 'certificate' },
  { text: 'i need a certificate', expected: 'certificate' },
  { text: 'any new notifications', expected: 'notification' },
  { text: 'what can you do', expected: 'help' },
  { text: 'menu', expected: 'help' },
  { text: 'bye', expected: 'goodbye' },
  { text: 'random text xyz', expected: 'unknown' }
];

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const result = detectIntent(test.text);
  const success = result.intent === test.expected;

  if (success) {
    passed++;
    console.log(`✅ "${test.text}" → ${result.intent} (conf: ${result.confidence})`);
  } else {
    failed++;
    console.log(`❌ "${test.text}" → ${result.intent} (expected: ${test.expected}, conf: ${result.confidence})`);
  }

  // Show entities for first few
  if (testCases.indexOf(test) < 3) {
    console.log(`   Entities:`, JSON.stringify(result.entities));
  }
}

console.log('\n' + '='.repeat(60));
console.log(`Results: ${passed}/${testCases.length} passed (${((passed/testCases.length)*100).toFixed(1)}%)`);

// Test RAG retrieval
console.log('\n📚 RAG Knowledge Retrieval Test:');
const ragTests = ['attendance rules', 'certificate fee', 'timetable timing'];
for (const q of ragTests) {
  const docs = retrieveContext(q, 2);
  console.log(`
  "${q}" → ${docs.length} docs retrieved`);
  docs.forEach(d => console.log(`    - ${d.topic}: ${d.content.substring(0, 60)}...`));
}

// Test NLP preprocessing
console.log('\n🔤 NLP Preprocessing Test:');
const nlpTest = preprocessText('My USN is 4MC22CS070 and I was born on 14-03-2004');
console.log(`  Input: "My USN is 4MC22CS070 and I was born on 14-03-2004"`);
console.log(`  Tokens:`, nlpTest.tokens.slice(0, 10), '...');
console.log(`  Lemmas:`, nlpTest.lemmas.slice(0, 10), '...');
console.log(`  USN detected:`, nlpTest.entities.usn || 'None');
console.log(`  Dates:`, nlpTest.entities.dates);

console.log('\n✨ AI Engine test complete!');
