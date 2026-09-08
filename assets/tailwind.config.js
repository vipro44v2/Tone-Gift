module.exports = {
  prefix: 'tw',
  corePlugins: {
    preflight: false,
  },
  content: [
    './layout/**/*.liquid',
    './templates/**/*.liquid',
    './sections/**/*.liquid',
    './snippets/**/*.liquid',
    './blocks/**/*.liquid',
    './assets/**/*.js'
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
