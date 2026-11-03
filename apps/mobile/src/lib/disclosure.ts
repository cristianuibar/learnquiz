export async function acknowledgeDisclosure(dependencies: {
  acknowledge(): Promise<unknown>
  setDisclosed(): void
  takeHeldTarget(): string | null
}): Promise<string> {
  await dependencies.acknowledge()
  dependencies.setDisclosed()
  return dependencies.takeHeldTarget() ?? '/(tabs)/today'
}
