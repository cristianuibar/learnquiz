import { z } from 'zod'

// Strict json_schema mode: every property required, no optional. Use .nullable().

// Job 7.1: curriculum skeleton. Prerequisites are concept names; code resolves them to ids.
export const CurriculumSkeleton = z.object({
  units: z
    .array(
      z.object({
        name: z.string().max(80),
        summary: z.string().max(300),
        concepts: z
          .array(
            z.object({
              name: z.string().max(80),
              summary: z.string().max(400),
              visual: z.boolean(),
              prerequisites: z.array(z.string().max(80)).max(4),
              source_quote: z.string().max(300).nullable(),
              critical: z.boolean(),
              misconceptions: z.array(z.string().max(200)).max(3),
            }),
          )
          .min(4)
          .max(8),
      }),
    )
    .min(4)
    .max(10),
})
export type CurriculumSkeleton = z.infer<typeof CurriculumSkeleton>

// Job 7.2: one item. The shape alone goes to the model; ItemPayload adds the cross-field rules.
const ItemShape = z.object({
  format: z.enum(['mcq', 'multi', 'cloze', 'short', 'order']),
  stem: z.string().min(1).max(600),
  options: z
    .array(z.object({ id: z.string().max(4), text: z.string().max(300), is_correct: z.boolean(), feedback: z.string().max(300) }))
    .max(5),
  accepted_answers: z.array(z.string().max(120)).max(6),
  model_answer: z.string().max(600),
  explanation: z.string().max(400),
  difficulty: z.number().int().min(1).max(5),
  source_quote: z.string().max(300).nullable(),
  grounded: z.boolean(),
  bloom: z.enum(['remember', 'understand', 'apply']),
})

type Shape = z.infer<typeof ItemShape>
const rules: Record<Shape['format'], (i: Shape) => boolean> = {
  mcq: (i) => i.options.length >= 3 && i.options.length <= 4 && i.options.filter((o) => o.is_correct).length === 1,
  multi: (i) => {
    const right = i.options.filter((o) => o.is_correct).length
    return i.options.length >= 4 && i.options.length <= 5 && right >= 2 && right < i.options.length &&
      i.options.every((o) => o.feedback.trim()) && i.accepted_answers.length === 0
  },
  // Steps are stored in the correct order with ids a, b, c...
  order: (i) =>
    i.options.length >= 3 && i.options.length <= 5 &&
    i.options.every((o, n) => o.id === 'abcde'[n] && o.is_correct && o.feedback.trim()),
  cloze: (i) => i.options.length === 0 && i.accepted_answers.length > 0 && i.stem.split('____').length === 2,
  short: (i) => i.options.length === 0,
}

// The image is attached after generation, never by the model, so it is not part of ItemShape.
export const ItemPayload = ItemShape.extend({
  image: z.object({ key: z.string().min(1), alt: z.string().trim().min(1).max(300), width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
}).refine((i) => rules[i.format](i), {
  message:
    'mcq needs 3-4 options with exactly one correct; multi needs 4-5 options with feedback, at least 2 correct and 1 incorrect, and no accepted_answers; order needs 3-5 correct steps with ids a-e in order and feedback; cloze and short need no options; cloze needs accepted_answers and exactly one ____ in the stem',
})
export type ItemPayload = z.infer<typeof ItemPayload>

// Items are checked one by one with ItemPayload so a single bad item does not discard the batch.
export const ItemBatch = z.object({ items: z.array(ItemShape) })
export type ItemBatch = z.infer<typeof ItemBatch>

// Job 7.3: self-check verdicts, index = position in the drafted batch (0-based).
export const SelfCheck = z.object({
  results: z.array(z.object({ index: z.number().int().min(0).max(99), keep: z.boolean(), reasons: z.array(z.string().max(200)).max(4) })),
})
export type SelfCheck = z.infer<typeof SelfCheck>

// Job 7.4: short-answer grading against the model answer and source quote.
export const Grade = z.object({
  score: z.number().min(0).max(1),
  feedback: z.string().min(1).max(400),
  missing_points: z.array(z.string().min(1).max(200)).max(6),
})
export type Grade = z.infer<typeof Grade>
