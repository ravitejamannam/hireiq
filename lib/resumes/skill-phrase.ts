const TRAITS = new Set([
  "hardworking",
  "detail oriented",
  "organised",
  "organized",
  "team player",
  "positive attitude",
  "willing to learn",
  "good communication",
  "good communication skills",
  "self motivator",
  "self-motivation",
  "self motivation",
  "flexibility",
  "dynamic personality",
  "creative",
  "a dynamic professional",
  "ready to take challenges",
  "dedicated towards my work",
  "compatible in any situation",
]);

const TRAIT_PHRASE =
  /\b(motivator|self-motivation|dynamic personality|dedicated towards|ready to take|demonstrate flexibility)\b/i;

const PLACE_OR_FACILITY =
  /\b(rooms?|washrooms?|workstations?|substations?|canals?|roads?|tanks?|nagar)\b/i;

const PLACE_NAME = new Set(["india", "dubai", "taif", "moradabad", "patna"]);

const BARE_DUTIES = new Set([
  "operation",
  "monitoring",
  "advising",
  "admin",
  "sales",
  "management",
  "software",
  "knowledge",
  "experience",
  "skills",
  "good",
  "excellent",
]);

const DEGREE_NAME =
  /^(?:b\.?\s?tech|m\.?\s?tech|b\.?\s?e\b|m\.?\s?e\b|b\.?\s?sc|m\.?\s?sc|mba|mca|diploma|bachelor|master|ph\.?\s?d)\b/i;

const TITLE =
  /\b(?:engineer|supervisor|officer|manager|technician|foreman|worker|personnel|personel)\b/i;

const DUTY_START =
  /^(?:making|checking|preparing|preparation of|maintaining|maintain |ensuring|working|responsible|monitoring|dealing|carry|participat|worked|providing|testing of|operation\s*[&+]\s*maintenance|operation and maintenance|knowledge of|knowledge in|the ability|good knowledge|established|diagnos|installation of|installation and maintenance|provide |construction of|prepare |inspection of|inspection request|coordination|co-ordination|witnessing|planning of|handling |sourcing |analyzing |pouring |erection\b|commissioning and|to check|to maintain|correspond |well conversant|experience as|as a |languages?\s+know|using |fulfilled|app\.?\s*packages)/i;

/**
 * A skill is a short noun phrase: a tool, method, trade, language, standard, or piece of equipment.
 * Sentences, job titles, traits, and broken fragments are not skills.
 */
export function isResumeSkillPhrase(raw: string): boolean {
  const text = raw.replace(/^[\s•\-]+/, "").trim();
  if (text.length < 2 || text.length > 80) return false;
  if (/[.!?]$/.test(text)) return false;
  const open = text.match(/\(/g)?.length ?? 0;
  const close = text.match(/\)/g)?.length ?? 0;
  if (open !== close) return false;
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 5) return false;
  const folded = text.toLowerCase().replace(/\s+/g, " ");
  if (TRAITS.has(folded) || BARE_DUTIES.has(folded) || DEGREE_NAME.test(text)) return false;
  if (words.length === 1 && folded.length < 2) return false;
  if (TITLE.test(folded)) return false;
  if (DUTY_START.test(text)) return false;
  if (TRAIT_PHRASE.test(text)) return false;
  if (PLACE_OR_FACILITY.test(text) || PLACE_NAME.has(folded)) return false;
  if (/^[A-Z]{6,}$/.test(text)) return false;
  if (/\s+(?:and|of)\s*$/i.test(text) || /^(?:and|of)\b/i.test(text) || text.startsWith("&")) return false;
  if (/^(?:supervision of|daily (?:work |rejection )?report|languages?\s+english)\b/i.test(text)) return false;
  if (/^(?:square meters?|kilograms?|safety|valve|leave schedule|monthly invoices)$/i.test(text)) return false;
  if (/\bworkshop\b/i.test(text)) return false;
  if (/\b\d{1,2}\.\d{1,2}\.\d{4}\b/.test(text)) return false;
  if (/\b(player in|such as)\b/i.test(text)) return false;
  if (/^(and|or|of|the)$/i.test(text)) return false;
  return true;
}
