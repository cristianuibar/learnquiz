import serverEntry from '@tanstack/react-start/server-entry'

export default {
  fetch(request) {
    return serverEntry.fetch(request)
  },
  async queue() {},
  async scheduled() {},
} satisfies ExportedHandler<Env>
