import { z } from 'zod'

// Strict json_schema mode: every property required, no optional. Use .nullable().

// Job 7.1: curriculum skeleton. Prerequisites are concept names; code resolves them to ids.
export const CurriculumSkeleton = z.object({
  units: z
    .array(
      z.object({
        name: z.string(),
        summary: z.string(),
        concepts: z
          .array(
            z.object({
              name: z.string(),
              summary: z.string(),
              prerequisites: z.array(z.string()),
              source_quote: z.string().nullable(),
              misconceptions: z.array(z.string()),
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
  format: z.enum(['mcq', 'cloze', 'short']),
  stem: z.string().min(1),
  options: z.array(z.object({ id: z.string(), text: z.string(), is_correct: z.boolean(), feedback: z.string() })),
  accepted_answers: z.array(z.string()),
  model_answer: z.string(),
  explanation: z.string().max(400),
  difficulty: z.number().int().min(1).max(5),
  source_quote: z.string().nullable(),
  grounded: z.boolean(),
  bloom: z.enum(['remember', 'understand', 'apply']),
})

export const ItemPayload = ItemShape.refine(
  (i) =>
    i.format === 'mcq'
      ? i.options.length >= 3 && i.options.length <= 4 && i.options.filter((o) => o.is_correct).length === 1
      : i.options.length === 0 && (i.format !== 'cloze' || i.accepted_answers.length > 0),
  { message: 'mcq needs 3-4 options with exactly one correct; cloze and short need no options; cloze needs accepted_answers' },
)
export type ItemPayload = z.infer<typeof ItemPayload>

// Items are checked one by one with ItemPayload so a single bad item does not discard the batch.
export const ItemBatch = z.object({ items: z.array(ItemShape) })
export type ItemBatch = z.infer<typeof ItemBatch>

// Job 7.3: self-check verdicts, index = position in the drafted batch (0-based).
export const SelfCheck = z.object({
  results: z.array(z.object({ index: z.number().int().min(0).max(99), keep: z.boolean(), reasons: z.array(z.string()) })),
})
export type SelfCheck = z.infer<typeof SelfCheck>
