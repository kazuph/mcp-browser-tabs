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
async function closeChromeTab(
  windowIndex: number,
  tabIndex: number
): Promise<void> {
  const script = `
    tell application "Google Chrome"
      try
        set targetWindow to window ${windowIndex}
        set targetTab to tab ${tabIndex} of targetWindow
        close targetTab
      on error errMsg
        return "Error: " & errMsg
      end try
    end tell
  `;

  try {
    await execAsync(`osascript -e '${script}'`);
  } catch (error) {
    throw new Error(
      `Failed to close Chrome tab: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function getChromeTabsInfo(): Promise<
  Array<{
    windowIndex: number;
    tabs: Array<{ tabIndex: number; title: string; url: string }>;
  }>
> {
  const script = `
    tell application "Google Chrome"
      set windowList to windows
      set output to ""
      repeat with windowIndex from 1 to count of windowList
        set theWindow to item windowIndex of windowList
        set tabList to tabs of theWindow
        repeat with tabIndexInWindow from 1 to count of tabList
          set theTab to item tabIndexInWindow of tabList
          set output to output & windowIndex & "|||" & tabIndexInWindow & "|||" & (title of theTab) & "|||" & (URL of theTab) & "\\n"
        end repeat
      end repeat
      return output
    end tell
  `;

  try {
    const { stdout } = await execAsync(`osascript -e '${script}'`);
    const tabsData = stdout
      .trim()
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => {
        const [windowIndex, tabIndex, title, url] = line.split("|||");
        return {
          windowIndex: Number.parseInt(windowIndex, 10),
          tabIndex: Number.parseInt(tabIndex, 10),
          title,
          url,
        };
      });

    const groupedTabs = tabsData.reduce(
      (acc, tab) => {
        const windowGroup = acc.find(
          (group) => group.windowIndex === tab.windowIndex
        );
        if (windowGroup) {
          windowGroup.tabs.push({
            tabIndex: tab.tabIndex,
            title: tab.title,
            url: tab.url,
          });
        } else {
          acc.push({
            windowIndex: tab.windowIndex,
            tabs: [
              {
                tabIndex: tab.tabIndex,
                title: tab.title,
                url: tab.url,
              },
            ],
          });
        }
        return acc;
      },
      [] as Array<{
        windowIndex: number;
        tabs: Array<{ tabIndex: number; title: string; url: string }>;
      }>
    );

    return groupedTabs;
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
      {
        name: "close_tab",
        description:
          "Close a specific tab in Google Chrome by window and tab index. When closing multiple tabs, start from the highest index numbers to avoid index shifting. After closing tabs, use get_tabs to confirm the changes.",
        inputSchema: zodToJsonSchema(
          z.object({
            windowIndex: z.number().int().positive(),
            tabIndex: z.number().int().positive(),
          })
        ),
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

      if (name === "get_tabs") {
        const windowTabs = await getChromeTabsInfo();
        const formattedTabs = windowTabs
          .map(
            (window) => `Window ${window.windowIndex}:
${window.tabs
  .map(
    (tab) => `  ${window.windowIndex}-${tab.tabIndex}. ${tab.title}
     ${tab.url}`
  )
  .join("\n")}`
          )
          .join("\n\n");

        const totalTabs = windowTabs.reduce(
          (sum, window) => sum + window.tabs.length,
          0
        );
        return {
          content: [
            {
              type: "text",
              text: `Found ${totalTabs} open tabs in Chrome:\n\n${formattedTabs}`,
            },
          ],
        };
      }
      if (name === "close_tab") {
        const { windowIndex, tabIndex } = request.params.arguments as {
          windowIndex: number;
          tabIndex: number;
        };
        await closeChromeTab(windowIndex, tabIndex);
        return {
          content: [
            {
              type: "text",
              text: `Successfully closed tab at window ${windowIndex}, tab ${tabIndex}`,
            },
          ],
        };
      }
      throw new Error(`Unknown tool: ${name}`);
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
