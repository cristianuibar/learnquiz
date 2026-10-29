import { MAX_SOURCE_TEXT_CHARS } from '@/lib/limits'
import type { ItemPayload } from '@/lib/llm/schemas'

type Prompt = { system: string; user: string }

const LEVELS = ['novice', 'beginner', 'intermediate', 'advanced', 'fluent']
const levelLabel = (level: number) => `${level} of 5 (${LEVELS[Math.min(5, Math.max(1, Math.round(level))) - 1]})`

// The stored source is already capped at the trust boundary; this slice only guards direct callers.
const SOURCE_CAP = MAX_SOURCE_TEXT_CHARS

// Job 7.1: curriculum skeleton.
export function curriculumPrompt(a: {
  topic: string
  goal?: string | null
  levelHint: number
  sourceText?: string | null
}): Prompt {
  const source = a.sourceText?.slice(0, SOURCE_CAP)
  return {
    system: `You are a curriculum designer for a quiz-based learning app. Output JSON only.
Rules:
- 4 to 10 units, ordered from foundations to advanced. 4 to 8 concepts per unit.
- A concept is the smallest teachable idea, testable with 1 to 3 questions. Names are short and unique across the whole curriculum.
- summary: one or two sentences, at most 300 characters. misconceptions: 1 or 2 common mistakes learners make on that concept, each under 200 characters.
- prerequisites: exact names of other concepts in this curriculum that must be learned first. Direct prerequisites only, no transitive ones, no cycles. Use [] for foundations.
- source_quote: when source text is given, a short verbatim passage (at most 200 characters) from it that supports the concept, copied exactly; null when none fits. Always null when no source text is given.
- Ground every claim in the source text when it is given. Do not invent facts.`,
    user: `Topic: ${a.topic}
Learner goal: ${a.goal?.trim() || 'not stated'}
Learner level hint: ${levelLabel(a.levelHint)}. Cover the whole topic from the basics up; do not assume more than this level.${
      source ? `\n\nSource text:\n"""\n${source}\n"""` : '\n\nNo source text: use your own knowledge.'
    }`,
  }
}

// Job 7.2: six items for one concept.
export function itemsPrompt(a: {
  topic: string
  goal?: string | null
  concept: { name: string; summary: string }
  misconceptions: string[]
  targetDifficulty: number
  spread?: boolean // placement: difficulties across 1 to 5 instead of around the target
  formats: ('mcq' | 'cloze' | 'short')[]
  sourceQuote?: string | null
  avoidStems: string[]
}): Prompt {
  const formats = a.formats.join(', ')
  return {
    system: `You write quiz items for a learning app. Output JSON only.
Write exactly 6 items for the given concept.
- Allowed formats: ${formats}. ${
      a.formats.includes('short') ? 'Mix them.' : 'Never use any other format.'
    } When mcq and cloze are both allowed, write at least 2 of each.
- difficulty is an integer 1 to 5. ${
      a.spread
        ? 'Spread the six items across the whole range: use every difficulty from 1 to 5 at least once.'
        : 'Stay within 1 of the target difficulty, and hit the target itself at least 3 times.'
    }
- mcq: 3 or 4 options with ids "a", "b", "c", "d"; exactly one has is_correct true. Every option has feedback: why it is right, or why it is wrong. Wrong options come from the listed misconceptions or other common errors. accepted_answers is [].
- cloze: the stem contains ____ exactly once. options is []. accepted_answers lists every acceptable spelling of the blank (1 to 4 entries).
- short: options is [] and accepted_answers is []. model_answer is a one or two sentence answer.
- model_answer: the correct answer in a few words (the key text for mcq, the blank for cloze).
- explanation: at most 2 sentences on why the key is right.
- Ground every claim in the quote when a quote is given: source_quote is copied verbatim from it (or null) and grounded is true. Otherwise set source_quote to null and grounded to false.
- bloom is remember, understand or apply.
- Writing rules: one defensible key; no "all of the above" or "none of the above"; no negative stems; options similar in length and form; the stem is answerable without seeing the options.
- Every stem must differ from the stems to avoid.`,
    user: `Topic: ${a.topic}
Learner goal: ${a.goal?.trim() || 'not stated'}
Target difficulty: ${a.spread ? 'spread across 1 to 5' : `${a.targetDifficulty} of 5 (learner level ${levelLabel(a.targetDifficulty)})`}
Formats: ${formats}
Concept: ${a.concept.name}
Summary: ${a.concept.summary}
Known misconceptions: ${a.misconceptions.length ? a.misconceptions.join('; ') : 'none listed'}
Quote: ${a.sourceQuote ? `"${a.sourceQuote}"` : 'none'}
Stems to avoid: ${a.avoidStems.length ? a.avoidStems.map((s) => `"${s}"`).join('; ') : 'none'}`,
  }
}

// Job 7.3: Haladyna-rule review of drafted items; the model's index is the position in `items`.
export function selfCheckPrompt(a: { items: ItemPayload[] }): Prompt {
  return {
    system: `You review drafted quiz items against the Haladyna item-writing rules. Output JSON only.
Return exactly one result per item, with the item's index (0-based, as given). keep is false when any rule fails; reasons names each failed rule in a few words, and is [] when keep is true.
Rules:
1. Exactly one defensible key: the marked correct answer is right, and no other option is also right.
2. No "all of the above" or "none of the above".
3. Distractors are plausible and homogeneous; none is absurd or gives the answer away through length or wording.
4. The stem is answerable without seeing the options.
5. Grounded in the quote: when source_quote is given, the key follows from it; when it is not given, grounded must be false.
6. Cloze items have one blank and accepted_answers that are all correct; short items have a correct model_answer.
Check facts yourself. Reject an item when the key is wrong.`,
    user: `Items:\n${JSON.stringify(a.items.map((item, index) => ({ index, ...item })))}`,
  }
}
