import { spawn } from "node:child_process";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const distEntry = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/index.js"
);

// Boots the real compiled stdio server. Tab manipulation itself needs a
// running Chrome on macOS, so this verifies the protocol surface: pure
// JSON-RPC on stdout, correct serverInfo version, and the advertised tools.
describe("mcp-browser-tabs server", () => {
  it("responds to initialize and tools/list over stdio", async () => {
    const result = await new Promise<{ stdoutLines: string[] }>(
      (resolve, reject) => {
        const p = spawn("node", [distEntry]);
        let out = "";
        p.stdout.on("data", (d) => {
          out += d.toString();
        });
        p.on("error", reject);
        const send = (o: object) => p.stdin.write(`${JSON.stringify(o)}\n`);
        send({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: { name: "test", version: "1.0" },
          },
        });
        setTimeout(
          () =>
            send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }),
          600
        );
        setTimeout(() => {
          p.kill();
          resolve({ stdoutLines: out.trim().split("\n").filter(Boolean) });
        }, 1800);
      }
    );

    const parsed = result.stdoutLines.map((l) => JSON.parse(l));
    const init = parsed.find((m) => m.id === 1);
    const pkgVersion = (
      await import("../package.json", { with: { type: "json" } })
    ).default.version;
    expect(init?.result?.serverInfo?.version).toBe(pkgVersion);
    const tools = parsed.find((m) => m.id === 2);
    expect(tools?.result?.tools?.length).toBeGreaterThanOrEqual(1);
  });
});
