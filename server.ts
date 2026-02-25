import { createServer } from "http";
import next from "next";
import { Server as SocketIOServer } from "socket.io";
import { initQuoteWebSocket } from "./lib/ws-server";

const dev = process.env.NODE_ENV !== "production";
const port = parseInt(process.env.PORT ?? "3000", 10);

const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res);
  });

  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",")
    : dev ? ["http://localhost:3000"] : [];

  const io = new SocketIOServer(httpServer, {
    path: "/ws",
    cors: { origin: allowedOrigins.length ? allowedOrigins : false },
  });

  initQuoteWebSocket(io);

  // Graceful shutdown
  const shutdown = () => {
    console.log("> Shutting down...");
    io.close();
    httpServer.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  httpServer.listen(port, () => {
    console.log(`> Server listening on http://localhost:${port} (${dev ? "dev" : "production"})`);
  });
});
