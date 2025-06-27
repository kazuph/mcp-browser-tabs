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

// Enhanced Chrome tab interface with unique IDs
interface ChromeTab {
  id: number;           // Unique Chrome tab ID
  windowId: number;     // Window ID
  title: string;
  url: string;
  isActive: boolean;
  windowIndex: number;  // For backward compatibility
  tabIndex: number;     // For backward compatibility
}

interface ChromeWindow {
  windowId: number;
  windowIndex: number;
  tabs: ChromeTab[];
}

// Get Chrome tabs with unique IDs
async function getChromeTabsWithIds(): Promise<ChromeWindow[]> {
  const script = `
    tell application "Google Chrome"
      set windowList to windows
      set output to ""
      repeat with windowIndex from 1 to count of windowList
        set theWindow to item windowIndex of windowList
        set windowID to id of theWindow
        set activeTabIndex to active tab index of theWindow
        set tabList to tabs of theWindow
        repeat with tabIndexInWindow from 1 to count of tabList
          set theTab to item tabIndexInWindow of tabList
          set tabID to id of theTab
          set isActive to (tabIndexInWindow = activeTabIndex)
          set output to output & windowID & "|||" & windowIndex & "|||" & tabID & "|||" & tabIndexInWindow & "|||" & isActive & "|||" & (title of theTab) & "|||" & (URL of theTab) & "\\n"
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
        const [windowId, windowIndex, tabId, tabIndex, isActive, title, url] = line.split("|||");
        return {
          windowId: Number.parseInt(windowId, 10),
          windowIndex: Number.parseInt(windowIndex, 10),
          tabId: Number.parseInt(tabId, 10),
          tabIndex: Number.parseInt(tabIndex, 10),
          isActive: isActive === "true",
          title: title || "",
          url: url || "",
        };
      });

    // Group by windows
    const windowMap = new Map<number, ChromeWindow>();
    
    for (const tabData of tabsData) {
      if (!windowMap.has(tabData.windowId)) {
        windowMap.set(tabData.windowId, {
          windowId: tabData.windowId,
          windowIndex: tabData.windowIndex,
          tabs: [],
        });
      }
      
      const window = windowMap.get(tabData.windowId)!;
      window.tabs.push({
        id: tabData.tabId,
        windowId: tabData.windowId,
        title: tabData.title,
        url: tabData.url,
        isActive: tabData.isActive,
        windowIndex: tabData.windowIndex,
        tabIndex: tabData.tabIndex,
      });
    }

    return Array.from(windowMap.values());
  } catch (error) {
    throw new Error(
      `Failed to get Chrome tabs: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Close tab by unique ID
async function closeChromeTabById(tabId: number): Promise<void> {
  const script = `
    tell application "Google Chrome"
      set targetTabID to "${tabId}"
      set tabFound to false
      
      repeat with w in (every window)
        repeat with t in (every tab of w)
          if (id of t) as string = targetTabID then
            close t
            set tabFound to true
            exit repeat
          end if
        end repeat
        if tabFound then exit repeat
      end repeat
      
      if not tabFound then
        error "Tab with ID " & targetTabID & " not found"
      end if
    end tell
  `;

  try {
    await execAsync(`osascript -e '${script}'`);
  } catch (error) {
    throw new Error(
      `Failed to close Chrome tab with ID ${tabId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Activate tab by unique ID
async function activateChromeTabById(tabId: number): Promise<void> {
  const script = `
    tell application "Google Chrome"
      set targetTabID to "${tabId}"
      set tabFound to false
      
      repeat with w in (every window)
        repeat with i from 1 to count of (every tab of w)
          set t to item i of (every tab of w)
          if (id of t) as string = targetTabID then
            set (active tab index of w) to i
            set index of w to 1
            set tabFound to true
            exit repeat
          end if
        end repeat
        if tabFound then exit repeat
      end repeat
      
      if not tabFound then
        error "Tab with ID " & targetTabID & " not found"
      end if
    end tell
  `;

  try {
    await execAsync(`osascript -e '${script}'`);
  } catch (error) {
    throw new Error(
      `Failed to activate Chrome tab with ID ${tabId}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

// Legacy function for backward compatibility
async function closeChromeTabByIndex(
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

// Schema definitions
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

// Server setup
const server = new Server(
  {
    name: "mcp-browser-tabs",
    version: "2.0.0",
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

// Tools list handler
server.setRequestHandler(
  ListToolsSchema,
  async (request: { method: "tools/list" }, extra: RequestHandlerExtra) => {
    const tools = [
      {
        name: "get_tabs",
        description: "Get all open tabs from Google Chrome browser with unique tab IDs. Each tab has a stable, unique ID that persists across browser operations. Output shows both display format (1-1, 1-2) and Tab ID [Tab ID: 1234567890] for each tab. ALWAYS use the Tab ID number for reliable operations.",
        inputSchema: zodToJsonSchema(z.object({})),
      },
      {
        name: "close_tab_by_id",
        description: "🔥 PREFERRED METHOD: Close a specific tab in Google Chrome using its unique tab ID. IMMUNE to tab reordering, window changes, and index shifting. Extract the Tab ID from [Tab ID: 1234567890] in get_tabs output. Example: if tab shows '[Tab ID: 1594670961]', use tabId: 1594670961",
        inputSchema: zodToJsonSchema(
          z.object({
            tabId: z.number().int().positive().describe("The exact Tab ID number from [Tab ID: xxxxx] in get_tabs output - NOT the display number"),
          })
        ),
      },
      {
        name: "activate_tab_by_id", 
        description: "🔥 PREFERRED METHOD: Activate (focus) a specific tab in Google Chrome using its unique tab ID. Brings the tab to the front and makes it active. Extract the Tab ID from [Tab ID: 1234567890] in get_tabs output.",
        inputSchema: zodToJsonSchema(
          z.object({
            tabId: z.number().int().positive().describe("The exact Tab ID number from [Tab ID: xxxxx] in get_tabs output - NOT the display number"),
          })
        ),
      },
      {
        name: "close_tab",
        description: "⚠️ LEGACY DANGER: Close a specific tab using window/tab index. HIGH RISK of closing wrong tabs due to index shifting when tabs are reordered/closed. STRONGLY DEPRECATED: Use close_tab_by_id instead. Only use if Tab ID is unavailable.",
        inputSchema: zodToJsonSchema(
          z.object({
            windowIndex: z.number().int().positive().describe("DANGEROUS: Window index (1-based) - can target wrong window"),
            tabIndex: z.number().int().positive().describe("DANGEROUS: Tab index (1-based) - changes when tabs are reordered"),
          })
        ),
      },
    ];
    return { tools };
  }
);

// Tool execution handler
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
        const windows = await getChromeTabsWithIds();
        
        const formattedOutput = windows
          .map((window) => {
            const activeTab = window.tabs.find(tab => tab.isActive);
            const activeIndicator = activeTab ? ` (Active: Tab ID ${activeTab.id})` : "";
            
            return `Window ${window.windowIndex}${activeIndicator}:
${window.tabs
  .map((tab) => {
    const activeMarker = tab.isActive ? " ★" : "";
    return `  ${window.windowIndex}-${tab.tabIndex}. ${tab.title}${activeMarker}
     ${tab.url}
     [Tab ID: ${tab.id}]${activeMarker}`;
  })
  .join("\n")}`;
          })
          .join("\n\n");

        const totalTabs = windows.reduce((sum, window) => sum + window.tabs.length, 0);
        
        return {
          content: [
            {
              type: "text",
              text: `Found ${totalTabs} open tabs in Chrome:

${formattedOutput}

🔥 CRITICAL INSTRUCTIONS FOR AI:
1. ALWAYS use Tab ID (numbers in [Tab ID: xxxxx]) for tab operations
2. NEVER use display numbers (1-1, 1-2) - these are just for human reference
3. Use close_tab_by_id or activate_tab_by_id with the Tab ID number
4. Example: If you see "[Tab ID: 1594670961]", use tabId: 1594670961

⚠️ DANGER: Window-Tab index changes when tabs are reordered/closed
✅ SAFE: Tab ID never changes and is unique across all tabs`,
            },
          ],
        };
      }

      if (name === "close_tab_by_id") {
        const { tabId } = request.params.arguments as { tabId: number };
        await closeChromeTabById(tabId);
        return {
          content: [
            {
              type: "text",
              text: `✅ Successfully closed tab with ID ${tabId}`,
            },
          ],
        };
      }

      if (name === "activate_tab_by_id") {
        const { tabId } = request.params.arguments as { tabId: number };
        await activateChromeTabById(tabId);
        return {
          content: [
            {
              type: "text", 
              text: `✅ Successfully activated tab with ID ${tabId}`,
            },
          ],
        };
      }

      if (name === "close_tab") {
        const { windowIndex, tabIndex } = request.params.arguments as {
          windowIndex: number;
          tabIndex: number;
        };
        await closeChromeTabByIndex(windowIndex, tabIndex);
        return {
          content: [
            {
              type: "text",
              text: `⚠️ LEGACY: Successfully closed tab at window ${windowIndex}, tab ${tabIndex}. Consider using close_tab_by_id for better reliability.`,
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
            text: `❌ Error: ${error instanceof Error ? error.message : String(error)}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Server startup
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Browser Tabs MCP server running on stdio");
}

runServer().catch((error) => {
  process.stderr.write(`Fatal error running server: ${error}\n`);
  process.exit(1);
});