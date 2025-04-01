# Load Testing Tool

A powerful load-testing tool designed to simulate and analyze HTTP requests while monitoring system performance. It provides logging, HTTP request handling, and MongoDB monitoring.

## Features

- **Concurrent HTTP Requests:** Simulates multiple users sending requests.
- **MongoDB Monitoring:** Tracks database performance during load tests.
- **Logging:** Detailed logs for analysis and debugging.
- **Customizable Load Scenarios:** Configure request rates and payloads.

## Installation

Install via npm:

```sh
npm install -g load_test_util
```

Or via yarn:

```sh
yarn add global load_test_utl
```

## Usage

### Basic Example

sample_config.json
```js
{
  "logDir": "load_test_logs",
  "prefix": "load_test",
  "mongoDBUrl": <mongo connection string>,
  "apiUrl": "https://example.com/api",
  "method": "POST",
  "payload": {
    "sample": 1,
    "data": 2
  },
  "startUsers": 200,
  "maxUsers": 2000,
  "incrementBy": 100,
  "durationPerStep": 30,
  "rampUpTime": 5
}
```

```sh
load-test --config /path/to/sample_config.json
Load test started. Logging to: load_test_logs/load_test_2025-04-01_21-35-53-568.txt
Starting load test...

Ramping up to 200 users...
```
## Configuration Options

```sh
logDir: Directory to store logs.
prefix: Prefix for log file names.
mongoDBUrl: MongoDB connection string for storing results (optional).
apiUrl: The API endpoint to test.
method: HTTP method (e.g., GET, POST).
payload: JSON payload for the request (used for POST or PUT methods).
startUsers: Number of users to start with.
maxUsers: Maximum number of concurrent users.
incrementBy: Number of users to add in each step.
durationPerStep: Duration (in seconds) for each step.
rampUpTime: Time (in seconds) to wait before ramping up users.
```
## Logging

Logs are stored in `logDir`. You can customize logging directory via config json.

## License

MIT License. See `LICENSE` for details.

