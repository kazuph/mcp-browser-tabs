# MCP Browser Tabs
[![smithery badge](https://smithery.ai/badge/@kazuph/mcp-browser-tabs)](https://smithery.ai/protocol/@kazuph/mcp-browser-tabs)

Model Context Protocol server for retrieving and managing Chrome browser tabs information. This allows Claude Desktop (or any MCP client) to fetch information about and control currently open Chrome tabs.

<a href="https://glama.ai/mcp/servers/wze1kc6emp"><img width="380" height="200" src="https://glama.ai/mcp/servers/wze1kc6emp/badge" alt="Browser Tabs Server MCP server" /></a>

## Quick Start (For Users)

To use this tool with Claude Desktop, simply add the following to your Claude Desktop configuration (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "tools": {
    "browser-tabs": {
      "command": "npx",
      "args": ["-y", "@kazuph/mcp-browser-tabs"]
    }
  }
}
```

This will automatically download and run the latest version of the tool when needed.

### Installing via Smithery

To install Browser Tabs for Claude Desktop automatically via [Smithery](https://smithery.ai/protocol/@kazuph/mcp-browser-tabs):

```bash
npm exec --package @smithery/cli smithery install @kazuph/mcp-browser-tabs --client claude
```

### Required Setup

1. Enable Accessibility for Chrome:
   - Open System Settings
   - Go to Privacy & Security > Accessibility
   - Click the "+" button
   - Add Google Chrome from your Applications folder
   - Turn ON the toggle for Chrome

This accessibility setting is required for AppleScript to interact with Chrome tabs.

## For Developers

The following sections are for those who want to develop or modify the tool.

### Prerequisites

- Node.js 18+
- macOS (for AppleScript operations)
- Google Chrome
- Claude Desktop (install from https://claude.ai/desktop)
- tsx (install via `npm install -g tsx`)

### Installation

```bash
git clone https://github.com/kazuph/mcp-browser-tabs.git
cd mcp-browser-tabs
npm install
npm run build
```

## Available Tools

- `get_tabs`: Retrieves all open tabs from Google Chrome browser, returning their titles and URLs. Tabs are grouped by window and displayed in a format like "Window 1-1" (Window 1, Tab 1).

- `close_tab`: Closes a specific tab in Google Chrome using window and tab indices.
  - Parameters:
    - windowIndex: Window number (starts from 1)
    - tabIndex: Tab number within the window (starts from 1)
  - Note: When closing multiple tabs, start from the highest index numbers to avoid index shifting. After closing tabs, use get_tabs to confirm the changes.

## Notes

- This tool is designed for macOS only due to its dependency on AppleScript.
- Requires Google Chrome to be installed and running.
- Accessibility permissions must be granted for Chrome.

## License

MIT License - see the [LICENSE](LICENSE) file for details
