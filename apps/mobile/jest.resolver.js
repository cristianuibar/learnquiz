const { dirname, sep } = require('node:path')

const workletsSource = /[\\/]react-native-worklets[\\/](src|lib)[\\/]/
const reanimatedRoot = dirname(require.resolve('react-native-reanimated/package.json'))
const workletsResolverPath = require.resolve('react-native-worklets/jest/resolver', { paths: [reanimatedRoot] })

require(workletsResolverPath)
require.cache[workletsResolverPath].exports = (request, options) => options.defaultResolver(request,
  workletsSource.test(options.basedir + sep) || request === 'react-native-worklets' || request.startsWith('react-native-worklets/')
    ? { ...options, extensions: options.extensions?.filter((ext) => !ext.includes('native')) }
    : options)

module.exports = require('react-native-reanimated/jest/resolver')
