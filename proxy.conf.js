const target = 'http://localhost:8080'
// const target = 'http://localhost:8080'

module.exports = {
  '/api/**': {
    target,
    secure: false,
    logLevel: 'debug',
    changeOrigin: true
  }
}
