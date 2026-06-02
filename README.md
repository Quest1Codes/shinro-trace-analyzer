# Shinro Query Analyzer

Diagnose Clickhouse queries for bottlenecks and performance improvements. It automates retrieval of trace logs for a Clickhouse query, correlates it with data found in system tables, and presents it in a format suitable for analysis.

Also supports more dynamic analysis and natural-language conversations with an LLM of your choice .

Supported on macOS, with other platforms arriving soon.

## Requirements
| Kind              | Supported                                                              |
|-------------------|------------------------------------------------------------------------|
| OS                | macOS **13** (Ventura) and later, macOS **15** (Sequoia)+ recommended. |
| Clickhouse Server | Local and Cloud deployments - **v25, v26**                             |
| Query Types       | INSERT, SELECT                                                         |
| LLM Provider      | OpenAI, Anthropic, OpenRouter                                          |

## Quickstart

- Download the tool from the [Releases page](https://github.com/Quest1Codes/shinro-trace-analyzer/releases)
- Make the tool accessible - Can be done in two ways. You can either:
  1. Add execution permissions to the downloaded file.
      ```shell
      # Grant execute permission
      chmod +x shinro-analyzer-macos-arm64
      # Remove quarantine flag
      xattr -d com.apple.quarantine shinro-analyzer-macos-arm64
      ```
  2. Or, approve execution from Settings:
      - Double-click the executable to open it. If this is the first time of running, you will be shown a warning about potential privacy issues.
      - Click on **Done**.
      - Open Settings -> Privacy and Security -> Scroll down to find the entry for the tool, and click on **Open Anyway**. Follow the prompts.
- The app opens, and a WebUI is available at [http://localhost:13000](http://localhost:13000) by default.
- The port used by the app is configurable as follows.
  ```shell
  ./shinro-analyzer-macos-arm64 --port=13001
  ```

## Demo & Screenshots

<details>
<summary>Expand</summary>

### <u>Demo Video</u>

[![Watch Demo Video](https://img.shields.io/badge/Watch-Demo%20Video-red?style=flat-square)](https://www.youtube.com/watch?v=gk4DKxoTR28)

[![Shinro Query Trace Analyzer — Demo](https://img.youtube.com/vi/gk4DKxoTR28/sddefault.jpg)](https://www.youtube.com/watch?v=gk4DKxoTR28)

### <u>Screenshots</u>

**Terminal** — launch the analyzer from the command line; it starts a local web server on port 13000

![Terminal](./images/terminal.png)

**Query Editor** — paste or write a ClickHouse SQL query, optionally add context for Shinro AI, and hit Analyze trace

![Query Editor](./images/query-editor.png)

**Session Overview** — Shinro AI on the left, analysis dashboard on the right, switchable via the top tab bar

![Session Overview](./images/session-overview.png)

<table>
  <tr>
    <td align="center"><b>Shinro AI Analysis</b><br/>Tool calls, executive summary, and key metrics — plain-language diagnosis of where the time went<br/><br/><img src="./images/shinro-ai-chat.png" width="420"/></td>
    <td align="center"><b>Analysis Dashboard</b><br/>Execution time, peak memory, rows read, and a full per-table I/O breakdown across all 17 tables<br/><br/><img src="./images/analysis-dashboard.png" width="420"/></td>
  </tr>
  <tr>
    <td align="center"><b>Query Editor Panel</b><br/>The traced query with syntax highlighting and one-click re-run<br/><br/><img src="./images/dashboard-query-editor.png" width="420"/></td>
    <td align="center"><b>Materialized Views</b><br/>Cascade-depth graph showing every MV triggered by the query and its individual cost<br/><br/><img src="./images/materialized-views.png" width="420"/></td>
  </tr>
</table>

</details>

## Build

- Prerequisite: Bun v1.3.13+. v1.3.12 has [a bug](https://github.com/oven-sh/bun/discussions/29151) that kills the built executable upon launch. Instructions on how to (re)install a specific version of Bun are [here](https://bun.com/docs/installation#installing-older-versions).
- Clone the repository, `cd` into the project directory.
- Run `bun install` to install dependencies.
- Run `bun build.ts` to build the frontend, and bundle the application into an executable. The built executable is present as `shinro-analyzer-macos-arm64` or `shinro-analyzer-macos-x86_64` in the same directory.

## Testing

The project includes a comprehensive unit test suite for backend components using Vitest.

### Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Test Coverage

- **Parser Logic**: 40 tests covering trace parsing, metadata extraction, table I/O stats, memory tracking, and materialized view analysis
- **Helper Functions**: 18 tests covering file system operations and path management
- **Overall Coverage**: 94.11% statements, 79.25% branches, 100% functions, 94.87% lines

### Test Design

- Unit tests only (no integration tests)
- All dependencies mocked (ClickHouse, file system operations)
- Fast execution (~150ms for full test suite)
- TypeScript with ES module support

## Data and Privacy

Shinro Query Analyzer for ClickHouse is local-first and open source. The tool does not call Quest1 servers as part of normal diagnostic operation. Calls go only to your ClickHouse server and to the AI provider you configure. The source code is on GitHub for inspection and audit.

| Data                                          | Local System | Quest1 Servers | AI Provider |
|-----------------------------------------------|--------------|----------------|-------------|
| ClickHouse connection details and credentials | **Yes**      | No             | No          |
| ClickHouse queries gathered                   | **Yes**      | No             | No          |
| Trace log data                                | **Yes**      | No             | **Yes**     |
| ClickHouse system table data                  | **Yes**      | No             | **Yes**     |
| MV fanout data                                | **Yes**      | No             | **Yes**     |
| Query output rows                             | No           | No             | No          |
| Feedback and feature requests                 | No           | **Yes**        | No          |

Structured diagnostic data stored locally is encrypted. Trace logs are written to `~/.shinro` on the local filesystem only.

## FAQ

<details>
<summary>Expand</summary>

**How is the tool distributed?**

Open source on GitHub. Clone the repo and build from source, or download a pre-built binary from the releases page. Requires a windowing system, the ClickHouse native command-line client, and a GUI browser.

**What's the license?**

Apache License Version 2.0

**Is my data safe?**

Yes. The tool makes no calls to Quest1 servers or services as part of diagnostic operation. All processing is local. Calls go only to the AI provider you configure and to your ClickHouse server. Local data is encrypted at rest. The source code is on GitHub if you want to verify any of this yourself.

**What platforms are supported today?**

macOS on Apple Silicon (ARM). Windows and Linux are on the roadmap.

**Does it support both self-hosted (OSS) and ClickHouse Cloud?**

Yes.

**What ClickHouse versions are supported?**

The tool supports version 25.x and above.

**What query types are supported?**

SELECT, INSERT, and UPDATE.

**How are asynchronous inserts supported?**

Async inserts are hard to trace by design — they execute in a separate scope with a different query ID from the one the client submitted, which breaks trace correlation. For diagnostic runs, the tool sets `async_insert = 0` for the session, forcing the insert to execute synchronously so its trace and system table records line up with the query you submitted. The setting is scoped to the diagnostic session; your cluster's default async behavior is unaffected.

**How do I get the tool?**

See the GitHub link below. Clone, build, or download a release binary.

**Can I contribute?**

Yes. Issues, pull requests, and bug reports welcome on the GitHub repo.

</details>

## License

Apache 2.0 — see [LICENSE](./LICENSE) for details.
