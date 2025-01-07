# MCP Browser Tabs

Model Context Protocol server for retrieving Chrome browser tabs information. This allows Claude Desktop (or any MCP client) to fetch information about currently open Chrome tabs.

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

- `get_tabs`: Retrieves all open tabs from Google Chrome browser, returning their titles and URLs.

## Notes

- This tool is designed for macOS only due to its dependency on AppleScript.
- Requires Google Chrome to be installed and running.
- Accessibility permissions must be granted for Chrome.

## License

MIT License - see the [LICENSE](LICENSE) file for details
