#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequest,
  ListToolsRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

// AppleScriptでChromeのタブ情報を取得
async function getChromeTabsInfo(): Promise<
  Array<{ title: string; url: string }>
> {
  const script = `
    tell application "Google Chrome"
      set tabList to {}
      set windowList to windows
      repeat with theWindow in windowList
        set tabList to tabList & (tabs of theWindow)
      end repeat
      set output to ""
      repeat with theTab in tabList
        set output to output & (title of theTab) & "|||" & (URL of theTab) & "\\n"
      end repeat
      return output
    end tell
  `;

  try {
    const { stdout } = await execAsync(`osascript -e '${script}'`);
    const tabs = stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const [title, url] = line.split("|||");
        return { title, url };
      });
    return tabs;
  } catch (error) {
    throw new Error(
      `Failed to get Chrome tabs: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// スキーマ定義
const ListToolsSchema = z.object({
  method: z.literal("tools/list"),
});

const CallToolSchema = z.object({
  method: z.literal("tools/call"),
  params: z.object({
    name: z.string(),
    arguments: z.record(z.unknown()).optional(),
  }),
});

// サーバーのセットアップ
const server = new Server(
  {
    name: "mcp-browser-tabs",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

interface RequestHandlerExtra {
  signal: AbortSignal;
}

// ツール一覧のハンドラー
server.setRequestHandler(
  ListToolsSchema,
  async (request: { method: "tools/list" }, extra: RequestHandlerExtra) => {
    const tools = [
      {
        name: "get_tabs",
        description: "Get all open tabs from Google Chrome browser",
        inputSchema: zodToJsonSchema(z.object({})),
      },
    ];
    return { tools };
  }
);

// ツール実行のハンドラー
server.setRequestHandler(
  CallToolSchema,
  async (
    request: {
      method: "tools/call";
      params: { name: string; arguments?: Record<string, unknown> };
    },
    extra: RequestHandlerExtra
  ) => {
    try {
      const { name } = request.params;

      if (name !== "get_tabs") {
        throw new Error(`Unknown tool: ${name}`);
      }

      const tabs = await getChromeTabsInfo();
      const formattedTabs = tabs
        .map((tab, index) => `${index + 1}. ${tab.title}\n   ${tab.url}`)
        .join("\n\n");

      return {
        content: [
          {
            type: "text",
            text: `Found ${tabs.length} open tabs in Chrome:\n\n${formattedTabs}`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// サーバーの起動
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Browser Tabs MCP server running on stdio");
}

runServer().catch((error) => {
  process.stderr.write(`Fatal error running server: ${error}\n`);
  process.exit(1);
});
