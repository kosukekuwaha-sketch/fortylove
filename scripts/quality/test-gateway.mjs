// Only a URL-prefix adapter, not a mocked database. Every query/RPC is executed by PostgREST/PostgreSQL.
import { createServer, request } from "node:http";

createServer((incoming, outgoing) => {
  if (!incoming.url.startsWith("/rest/v1/")) { outgoing.writeHead(404).end(); return; }
  const upstream = request({ hostname: "127.0.0.1", port: 54330, path: incoming.url.slice("/rest/v1".length), method: incoming.method, headers: { ...incoming.headers, host: "127.0.0.1:54330" } }, (response) => {
    outgoing.writeHead(response.statusCode, response.headers); response.pipe(outgoing);
  });
  upstream.on("error", () => { outgoing.writeHead(502).end(); });
  incoming.pipe(upstream);
}).listen(54331, "127.0.0.1");
