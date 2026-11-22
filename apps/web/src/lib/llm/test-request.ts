// Test helper for faked model HTTP: chat requests carry their JSON Schema in the system prompt (json_object mode),
// so a fake reads the schema there and names the job by its top-level field.
const NAMES: Record<string, string> = {
  units: 'curriculum_skeleton',
  items: 'item_batch',
  results: 'self_check',
  steps: 'session_plan',
  score: 'grade',
  nodes: 'procedure_graph',
  line: 'placement_line',
}

// `body` is the parsed or raw JSON body of a /chat/completions request.
export function requestedSchema(body: unknown): { name: string; schema: any } {
  const request = typeof body === 'string' ? JSON.parse(body) : body as { messages: { content: string }[] }
  const schema = JSON.parse(request.messages[0].content.split('JSON Schema:\n')[1])
  const field = Object.keys(schema.properties).find((key) => key in NAMES)
  return { name: field ? NAMES[field] : 'unknown', schema }
}
