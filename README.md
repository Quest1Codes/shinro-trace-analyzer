# Shinro Query Analyzer

Diagnose Clickhouse queries for bottlenecks and performance improvements. It automates retrieval of trace logs for a Clickhouse query, correlates it with data found in system tables, and presents it in a format suitable for analysis.

Also supports more detailed analysis and natural-language conversations with an LLM of your choice, by providing an OpenAI/Anthropic/OpenRouter API key.

Built using Typescript and React, using Bun as the runtime environment.

Supported on macOS 13 (Ventura) and later, macOS 15 (Sequoia)+ recommended.

## Quickstart

- Download the tool from the Releases page (todo: add link)
- Double click the executable to open it. If this is the first time of running, you will be shown a warning about potential privacy issues.
- Click on **Done**.
- Open Settings -> Privacy and Security -> Scroll down to find the entry for the tool, and click on **Open Anyway**. Follow the prompts.
- The app opens, and a WebUI is available at [http://localhost:13000](http://localhost:13000) by default.
- The port used by the app is configurable as follows.
  ```shell
  ./shinro-analyzer-macos-arm64 --port=13001
  ```

<details>
<summary>
    Screenshots
</summary>

![Screenshot of terminal output](./images/terminal.png)

![Screenshot of browser](./images/webui.png)

</details>

## Build

- Prerequisite: Bun v1.3.13+. v1.3.12 has [a bug](https://github.com/oven-sh/bun/discussions/29151) that kills the built executable upon launch. Instructions on how to (re)install a specific version of Bun are [here](https://bun.com/docs/installation#installing-older-versions).
- Clone the repository, `cd` into the project directory.
- Run `bun install` to install dependencies.
- Run `bun build.ts` to build the application. The built executable is present as `shinro-analyzer-macos-arm64` or `shinro-analyzer-macos-x86_64` in the same directory.

## License

(todo: fill)
