#!/usr/bin/env node

// Load testing script with configurable parameters
const http = require('http')
const https = require('https')
const MongoClient = require('mongodb').MongoClient

const fs = require('fs')
const util = require('util')
const path = require('path')

class LogManager {
  constructor(options = {}) {
    this.options = {
      logDir: options.logDir || 'logs',
      prefix: options.prefix || 'load_test',
      includeConsole: options.includeConsole !== false,
    }

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(this.options.logDir)) {
      fs.mkdirSync(this.options.logDir, { recursive: true })
    }

    this.logFile = null
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
    }
  }

  start() {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_')
      .replace('Z', '')

    const fileName = `${this.options.prefix}_${timestamp}.txt`
    const filePath = path.join(this.options.logDir, fileName)

    // Create write stream
    this.logFile = fs.createWriteStream(filePath, { flags: 'a' })

    // Override console methods
    console.log = (...args) => this.log('INFO', ...args)
    console.error = (...args) => this.log('ERROR', ...args)
    console.warn = (...args) => this.log('WARN', ...args)

    return filePath
  }

  log(level, ...args) {
    const timestamp = new Date().toISOString()
    const message = util.format(...args)
    const logLine = `[${timestamp}] [${level}] ${message}\n`

    // Write to file
    this.logFile.write(logLine)

    // Also write to console if enabled
    if (this.options.includeConsole) {
      switch (level) {
        case 'ERROR':
          this.originalConsole.error(message)
          break
        case 'WARN':
          this.originalConsole.warn(message)
          break
        default:
          this.originalConsole.log(message)
      }
    }
  }

  stop() {
    // Restore original console methods
    console.log = this.originalConsole.log
    console.error = this.originalConsole.error
    console.warn = this.originalConsole.warn

    // Close the file stream
    if (this.logFile) {
      this.logFile.end()
    }
  }
}

class LoadTester {
  constructor(config) {
    this.config = {
      url: config.url || 'http://localhost:3000',
      method: config.method || 'GET',
      payload: config.payload || null,
      startUsers: config.startUsers || 1,
      maxUsers: config.maxUsers || 100,
      incrementBy: config.incrementBy || 10,
      durationPerStep: config.durationPerStep || 60, // seconds
      rampUpTime: config.rampUpTime || 10, // seconds
    }

    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalLatency: 0,
    }
  }

  async sendRequest() {
    const isHttps = this.config.url.startsWith('https')
    const client = isHttps ? https : http

    const options = new URL(this.config.url)
    options.method = this.config.method
    options.headers = {
      'Content-Type': 'application/json',
    }

    return new Promise((resolve) => {
      const startTime = Date.now()
      const req = client.request(options, (res) => {
        let data = ''

        res.on('data', (chunk) => {
          data += chunk
        })

        res.on('end', () => {
          const endTime = Date.now()
          console.log(
            `Request completed with status code: ${res.statusCode} ${data.length}`
          )
          resolve({
            statusCode: res.statusCode,
            latency: endTime - startTime,
            success: res.statusCode >= 200 && res.statusCode < 400,
          })
        })
      })

      req.on('error', (error) => {
        const endTime = Date.now()
        resolve({
          statusCode: 0,
          latency: endTime - startTime,
          success: false,
          error: error.message,
        })
      })

      if (this.config.payload) {
        req.write(JSON.stringify(this.config.payload))
      }

      req.end()
    })
  }

  async runConcurrentUsers(numUsers, duration) {
    const startTime = Date.now()
    const endTime = startTime + duration * 1000

    const userPromises = Array(numUsers)
      .fill()
      .map(async () => {
        while (Date.now() < endTime) {
          const result = await this.sendRequest()

          this.stats.totalRequests++
          if (result.success) {
            this.stats.successfulRequests++
          } else {
            console.error(
              `Request failed with error: ${result.error} ${result.statusCode} ${result.latency}`
            )
            this.stats.failedRequests++
          }
          this.stats.totalLatency += result.latency
        }
      })

    await Promise.all(userPromises)
  }

  printStats(currentUsers) {
    const avgLatency = this.stats.totalLatency / this.stats.totalRequests
    console.log(`\nResults for ${currentUsers} concurrent users:`)
    console.log(`Total Requests: ${this.stats.totalRequests}`)
    console.log(`Successful Requests: ${this.stats.successfulRequests}`)
    console.log(`Failed Requests: ${this.stats.failedRequests}`)
    console.log(`Average Latency: ${avgLatency.toFixed(2)}ms`)
    console.log(
      `Success Rate: ${(
        (this.stats.successfulRequests / this.stats.totalRequests) *
        100
      ).toFixed(2)}%`
    )
  }

  async start() {
    console.log('Starting load test...')

    for (
      let users = this.config.startUsers;
      users <= this.config.maxUsers;
      users += this.config.incrementBy
    ) {
      console.log(`\nRamping up to ${users} users...`)

      // Reset stats for this step
      this.stats = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        totalLatency: 0,
      }

      // Wait for ramp-up
      await new Promise((resolve) =>
        setTimeout(resolve, this.config.rampUpTime * 1000)
      )

      // Run test for specified duration
      await this.runConcurrentUsers(users, this.config.durationPerStep)

      // Print stats for this step
      this.printStats(users)
    }

    console.log('\nLoad test completed!')
  }
}

class MongoDBMonitor {
  constructor(uri) {
    this.uri = uri
    this.client = new MongoClient(uri)
    this.metrics = {
      operations: {
        reads: 0,
        writes: 0,
        errors: 0,
      },
      latency: {
        total: 0,
        count: 0,
      },
      connections: {
        active: 0,
        max: 0,
      },
    }
  }

  async start() {
    await this.client.connect()
    this.startTime = Date.now()
    this.monitoringInterval = setInterval(() => this.collectMetrics(), 5000)
  }

  async stop() {
    clearInterval(this.monitoringInterval)
    await this.client.close()
  }

  async collectMetrics() {
    try {
      const db = this.client.db('admin')

      // Server statistics
      const serverStatus = await db.command({ serverStatus: 1 })

      // Database statistics
      const dbStats = await db.command({ dbStats: 1 })

      // Current operations
      const currentOps = await db.command({
        currentOp: 1,
        active: true,
      })

      const metrics = {
        timestamp: new Date(),
        connections: serverStatus.connections,
        opcounters: serverStatus.opcounters,
        memory: {
          resident: serverStatus.mem.resident,
          virtual: serverStatus.mem.virtual,
        },
        storage: {
          dataSize: dbStats.dataSize,
          storageSize: dbStats.storageSize,
          indexes: dbStats.indexes,
        },
        activeOperations: currentOps.inprog.length,
        networkStats: serverStatus.network,
      }

      console.log('Current MongoDB Metrics:', metrics)
      this.storeMetrics(metrics)
    } catch (error) {
      console.error('Error collecting metrics:', error)
    }
  }

  storeMetrics(metrics) {
    // Store or process metrics as needed
    this.metrics.connections.active = metrics.connections.current
    this.metrics.connections.max = Math.max(
      this.metrics.connections.max,
      metrics.connections.current
    )
  }

  getAverageLatency() {
    return this.metrics.latency.count > 0
      ? this.metrics.latency.total / this.metrics.latency.count
      : 0
  }

  printSummary() {
    const duration = (Date.now() - this.startTime) / 1000
    console.log('\nMongoDB Load Test Summary:')
    console.log('---------------------------')
    console.log(`Duration: ${duration.toFixed(2)} seconds`)
    console.log(
      `Total Operations: ${
        this.metrics.operations.reads + this.metrics.operations.writes
      }`
    )
    console.log(`Read Operations: ${this.metrics.operations.reads}`)
    console.log(`Write Operations: ${this.metrics.operations.writes}`)
    console.log(`Errors: ${this.metrics.operations.errors}`)
    console.log(`Average Latency: ${this.getAverageLatency().toFixed(2)}ms`)
    console.log(`Peak Connections: ${this.metrics.connections.max}`)
  }
}

// Usage with your load testing script
async function runLoadTest({
  logDir,
  prefix,
  mongoDBUrl,
  apiUrl,
  method,
  payload,
  startUsers,
  maxUsers,
  incrementBy,
  durationPerStep,
  rampUpTime,
}) {
  // Initialize logger
  const logger = new LogManager({
    logDir,
    prefix,
    includeConsole: true,
  })

  const logFile = logger.start()
  console.log(`Load test started. Logging to: ${logFile}`)

  const monitor = new MongoDBMonitor(mongoDBUrl)
  await monitor.start()

  // Your existing load test code here
  const loadTest = new LoadTester({
    // url: 'http://ec2-13-233-120-118.ap-south-1.compute.amazonaws.com:30008/address_by_URI',
    url: apiUrl,
    // url: 'http://distributed.puffles.io:30008/address_by_URI',
    method,
    payload,
    startUsers,
    maxUsers,
    incrementBy,
    durationPerStep,
    rampUpTime,
  })

  try {
    await loadTest.start()
  } finally {
    await monitor.stop()
    monitor.printSummary()
  }
}

function main() {
  // Parse command-line arguments
  const args = process.argv.slice(2)
  const configArgIndex = args.indexOf('--config')

  if (configArgIndex === -1 || !args[configArgIndex + 1]) {
    console.error(
      "Error: Missing required '--config' option with the path to the JSON configuration file."
    )
    process.exit(1)
  }

  const configPath = args[configArgIndex + 1]

  // Load and parse the JSON configuration file
  let config
  try {
    const configContent = fs.readFileSync(path.resolve(configPath), 'utf-8')
    config = JSON.parse(configContent)
  } catch (error) {
    console.error(
      `Error: Failed to load or parse the configuration file at '${configPath}'.`
    )
    console.error(error.message)
    process.exit(1)
  }

  // Run the load test with the loaded configuration
  runLoadTest(config)
}

main()

// async function createMonitoringUser(adminUri) {
//   const client = new MongoClient(adminUri);
//   try {
//       await client.connect();
//       const db = client.db('admin');

//       await db.addUser({
//           user: "monitoring_user",
//           pwd: "your_password",
//           roles: [
//               { role: "monitoringRole", db: "admin" },
//               { role: "readAnyDatabase", db: "admin" }
//           ]
//       });
//   } finally {
//       await client.close();
//   }
// }