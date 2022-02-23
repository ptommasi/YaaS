import { getAllLogs, logger } from "./logger";
import express from 'express';
import { Server } from "socket.io";
import { CorsOptions } from "cors";
import watchers from "../watchers/WatchersAggregator";

export function buildServer(options: { port: number, configuration: string }) {

  var cors = require('cors')
  const app = express();
  app.use(cors());

  const startTime = Date.now();
  
  const port = options.port;
  
  let http = require("http").Server(app);
  
  const corsOption: CorsOptions = {
    origin: "http://localhost:3000",
    credentials: true,
  }
  
  let io: Server = require("socket.io")(http, { cors: corsOption });

  http.listen(port, () => {
    return logger.info(`HTTP Server and WebSocket are listening on ${port}`);
  });

  app.get('/logs', (req, res) => {
    res.send({ logs: getAllLogs() });
  });

  watchers.Heartbeat.on(heartbeat => broadcast("onHeartbeat", heartbeat))

  watchers.ItemFound.on(foundItem => {
    broadcast("onItemFound", foundItem);
  })

  app.get('/monitored_links', (req, res) => {
    res.send(watchers.getLinks());
  });

  app.get('/monitored_searches', (req, res) => {
    res.send(watchers.getSearches());
  });

  app.get('/', (req, res) => res.send({ startTime, configuration: options.configuration }));

  function broadcast(type: string, msg: any) {
    io.sockets.emit(type, msg);
  };

  return { app, io };

}
