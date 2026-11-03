import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const usage = 'Usage: pnpm seed:northwind --local|--remote\nSupply NORTHWIND_OWNER_PASSWORD and NORTHWIND_LEARNER_PASSWORD through Proton Pass environment injection.'
const args = process.argv.slice(2)
if (args.length === 1 && ['--help', '-h'].includes(args[0])) {
  console.log(usage)
} else if (args.length !== 1 || !['--local', '--remote'].includes(args[0])) {
  console.error(usage)
  process.exitCode = 1
} else {
  const ownerPassword = process.env.NORTHWIND_OWNER_PASSWORD
  const learnerPassword = process.env.NORTHWIND_LEARNER_PASSWORD
  if (![ownerPassword, learnerPassword].every((password) => password && password.length >= 8 && password.length <= 128)) {
    console.error('Both runtime passwords must be between 8 and 128 characters. Inject them from Proton Pass; never pass them as command arguments.')
    process.exitCode = 1
  } else {
    let worker
    try {
      // The seed Worker always executes locally. Only its selected D1 binding may be remote.
      const { experimental_readRawConfig, unstable_dev } = await import('wrangler')
      const configPath = fileURLToPath(new URL('../wrangler.jsonc', import.meta.url))
      const { rawConfig } = experimental_readRawConfig({ config: configPath })
      const database = rawConfig.d1_databases?.find((binding) => binding.binding === 'DB')
      if (!database?.database_id) throw new Error('Missing DB configuration')
      const token = randomBytes(32).toString('hex')
      const vars = { NORTHWIND_SEED_TOKEN: token }
      for (const key of ['LLM_PROFILE', 'LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY', 'BASETEN_API_KEY', 'FIREWORKS_API_KEY', 'JOB_MODELS']) {
        if (process.env[key]) vars[key] = process.env[key]
      }
      worker = await unstable_dev(fileURLToPath(new URL('./northwind-worker.ts', import.meta.url)), {
        config: configPath,
        ip: '127.0.0.1',
        port: 0,
        logLevel: 'error',
        persist: true,
        vars,
        r2: [],
        experimental: {
          disableDevRegistry: true,
          disableExperimentalWarning: true,
          watch: false,
          d1Databases: [{ ...database, remote: args[0] === '--remote' }],
        },
      })
      const response = await worker.fetch('/seed', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-northwind-seed-token': token },
        body: JSON.stringify({ sopText: await readFile(new URL('./northwind-sop.md', import.meta.url), 'utf8'), ownerPassword, learnerPassword }),
      })
      if (!response.ok) {
        console.error(`Northwind seed failed (HTTP ${response.status}). Check migrations, model configuration, daily limits and existing demo records.`)
        process.exitCode = 1
      } else {
        console.log(JSON.stringify(await response.json(), null, 2))
      }
    } catch {
      // Never echo binding values, credentials or raw provider responses.
      console.error('Northwind seed failed to start. Check the local Wrangler configuration and D1 access.')
      process.exitCode = 1
    } finally {
      await worker?.stop()
    }
  }
}
