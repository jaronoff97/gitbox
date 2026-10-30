// A small MCP server inside gitbox, over HTTP on 127.0.0.1, so the agent behind Chat (Claude Code or
// Codex) can use the board's tools (src/tools.svelte.ts). JSON-RPC by hand: initialize, tools/list
// and tools/call are all an agent needs, and an SDK would be a dependency for three methods.
// ponytail: no sessions, no server-sent events; a tool's answer is one JSON reply.
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';

export type Tool = {
	name: string;
	description: string;
	inputSchema: object;
	run: (args: Record<string, any>) => Promise<unknown>;
};

let server: Promise<string> | null = null;

/** Starts the server once, with `tools`; resolves to its URL, which carries a random token. */
export function serve(tools: Tool[]): Promise<string> {
	server ??= new Promise((resolve, reject) => {
		const token = randomUUID();
		const http: Server = createServer(async (req, res) => {
			if (req.method !== 'POST' || req.url !== `/mcp/${token}`) return void res.writeHead(req.method === 'POST' ? 404 : 405).end();
			let body = '';
			for await (const chunk of req) body += chunk;
			let message: { id?: number | string; method: string; params?: any };
			try {
				message = JSON.parse(body);
			} catch {
				return void res.writeHead(400).end();
			}
			// A notification (no id) gets no answer.
			if (message.id === undefined) return void res.writeHead(202).end();
			const reply = (result: unknown) =>
				res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }));
			const fail = (code: number, text: string) =>
				res
					.writeHead(200, { 'content-type': 'application/json' })
					.end(JSON.stringify({ jsonrpc: '2.0', id: message.id, error: { code, message: text } }));
			const { method, params } = message;
			if (method === 'initialize')
				return reply({
					protocolVersion: params?.protocolVersion ?? '2025-06-18',
					capabilities: { tools: {} },
					serverInfo: { name: 'gitbox', version: '1' }
				});
			if (method === 'ping') return reply({});
			if (method === 'tools/list') return reply({ tools: tools.map(({ run, ...t }) => t) });
			if (method !== 'tools/call') return fail(-32601, `No method ${method}`);
			const tool = tools.find((t) => t.name === params?.name);
			if (!tool) return fail(-32602, `No tool ${params?.name}`);
			try {
				const out = await tool.run(params.arguments ?? {});
				reply({ content: [{ type: 'text', text: typeof out === 'string' ? out : JSON.stringify(out) }] });
			} catch (e) {
				reply({ content: [{ type: 'text', text: (e as Error).message }], isError: true });
			}
		});
		http.on('error', reject);
		// Port 0: any free one. It closes with the app.
		http.listen(0, '127.0.0.1', () => {
			const address = http.address();
			if (typeof address === 'object' && address) resolve(`http://127.0.0.1:${address.port}/mcp/${token}`);
		});
		http.unref();
	});
	return server;
}
