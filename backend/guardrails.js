// Fast pre-LLM guardrail check using keyword/pattern matching
// This saves LLM tokens and provides instant rejection for obvious off-topic prompts

const OFF_TOPIC_PATTERNS = [
  // General knowledge
  /who (is|was|invented|discovered|created)/i,
  /what is (the meaning|the capital|the population|the weather)/i,
  /tell me (a joke|a story|about history)/i,
  /write (a poem|an essay|a story|code|a function|a script|a song)/i,
  /how do (i cook|you cook|plants grow|vaccines work)/i,
  /explain (quantum|relativity|evolution|climate)/i,

  // Creative / general chat
  /once upon a time/i,
  /what's (your|ur) (name|favourite|opinion|favorite)/i,
  /do you (like|believe|think|feel)/i,
  /are you (human|conscious|sentient|alive|an ai)/i,
  /what (year|time) is it/i,
  /recommend (a movie|a book|a restaurant|music)/i,

  // Coding / tech unrelated to dataset
  /write (me )?a (function|class|program|algorithm|api|loop)/i,
  /debug (my|this) (code|program|script)/i,
  /how (do|does) (python|javascript|react|sql server|mysql|postgres) work/i,

  // Harmful / inappropriate
  /how (to|do you) (hack|crack|bypass|steal|cheat)/i,
  /ignore (previous|all|your) instructions/i,
  /pretend you are/i,
  /act as (a|an) (?!analyst|assistant)/i,
  /jailbreak/i,
  /disregard (your|all) (rules|instructions|constraints)/i,
  /you are now/i,
];

// Dataset-relevant keywords — if the message contains these it's likely on-topic
const DATASET_KEYWORDS = [
  'sales order', 'delivery', 'deliveries', 'billing', 'invoice', 'payment',
  'customer', 'material', 'product', 'journal', 'plant', 'order item',
  'so-', 'bill-', 'del-', 'pay-', 'je-', 'quantity', 'amount', 'currency',
  'shipped', 'billed', 'unbilled', 'incomplete', 'flow', 'trace', 'document',
  'posting', 'account', 'status', 'broken', 'missing', 'highest', 'lowest',
  'most', 'list', 'show', 'find', 'count', 'total', 'average', 'which', 'how many',
  'associated', 'linked', 'connected',
];

export function isOffTopic(message) {
  const lower = message.toLowerCase().trim();

  // If message is very short (e.g. "hi"), pass through to LLM
  if (lower.length < 10) return false;

  // If message contains dataset keywords, it's likely on-topic
  const hasDatasetKeyword = DATASET_KEYWORDS.some(kw => lower.includes(kw));
  if (hasDatasetKeyword) return false;

  // Check against off-topic patterns
  return OFF_TOPIC_PATTERNS.some(pattern => pattern.test(lower));
}

// Log guardrail triggers for debugging
export function logGuardrailHit(message, reason) {
  console.warn(`[GUARDRAIL] Blocked: "${message.slice(0, 80)}" — reason: ${reason}`);
}
