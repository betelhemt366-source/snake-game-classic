import express from "express";
import path from "path";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = createServer(app);

  // Set up WebSocket server
  const wss = new WebSocketServer({ noServer: true });

  interface Player {
    ws: WebSocket;
    id: string;
    name: string;
  }

  interface Room {
    id: string;
    players: Player[];
    foods: any[];
    matchStarted: boolean;
  }

  let waitingPlayers: Player[] = [];
  let rooms: Map<string, Room> = new Map();

  // Helper to remove player from matchmaking or rooms
  function cleanupPlayer(ws: WebSocket) {
    // 1. Remove from waiting queue
    const queueIndex = waitingPlayers.findIndex(p => p.ws === ws);
    if (queueIndex !== -1) {
      console.log(`Removing player ${waitingPlayers[queueIndex].name} from waiting queue`);
      waitingPlayers.splice(queueIndex, 1);
    }

    // 2. Remove from active rooms
    for (const [roomId, room] of rooms.entries()) {
      const pIndex = room.players.findIndex(p => p.ws === ws);
      if (pIndex !== -1) {
        const disconnectedPlayer = room.players[pIndex];
        console.log(`Player ${disconnectedPlayer.name} disconnected from room ${roomId}`);
        room.players.splice(pIndex, 1);

        // Notify other player they won by forfeit
        if (room.players.length > 0) {
          const opponent = room.players[0];
          if (opponent.ws.readyState === WebSocket.OPEN) {
            opponent.ws.send(JSON.stringify({
              type: "opponent_disconnected",
              message: `${disconnectedPlayer.name} disconnected. You win by forfeit!`
            }));
          }
        }
        rooms.delete(roomId);
      }
    }
  }

  wss.on("connection", (ws: WebSocket) => {
    console.log("New WebSocket client connected");
    let myPlayer: Player | null = null;

    ws.on("message", (message: string) => {
      try {
        const data = JSON.parse(message);
        switch (data.type) {
          case "join_matchmaking": {
            // Player wants to join matchmaking
            myPlayer = {
              ws,
              id: data.id || Math.random().toString(36).substring(2, 9),
              name: data.name || "Anonymous Snake"
            };

            // Avoid adding duplicate connections
            cleanupPlayer(ws);

            waitingPlayers.push(myPlayer);
            console.log(`Player ${myPlayer.name} joined matchmaking queue. Queue size: ${waitingPlayers.length}`);

            // If we have at least 2 players, match them!
            if (waitingPlayers.length >= 2) {
              const p1 = waitingPlayers.shift()!;
              const p2 = waitingPlayers.shift()!;
              const roomId = `room_${Math.random().toString(36).substring(2, 9)}`;

              const colorsPool = ['#ff4da6', '#bd00ff', '#39ff14', '#00f0ff', '#fffb00', '#ff9900'];
              const initialFoods = [];
              for (let i = 0; i < 70; i++) {
                initialFoods.push({
                  x: Math.random() * 740 + 30,
                  y: Math.random() * 740 + 30,
                  val: 10,
                  radius: 4 + Math.random() * 2,
                  color: colorsPool[Math.floor(Math.random() * colorsPool.length)],
                  isOrb: false,
                  pulse: Math.random() * Math.PI
                });
              }

              const room: Room = {
                id: roomId,
                players: [p1, p2],
                foods: initialFoods,
                matchStarted: true
              };

              rooms.set(roomId, room);
              console.log(`Match started in ${roomId} between ${p1.name} and ${p2.name}`);

              // Notify Player 1
              p1.ws.send(JSON.stringify({
                type: "match_start",
                roomId,
                playerIndex: 0,
                opponentName: p2.name,
                foods: initialFoods,
                p1Spawn: { x: 200, y: 400, angle: 0 },
                p2Spawn: { x: 600, y: 400, angle: Math.PI }
              }));

              // Notify Player 2
              p2.ws.send(JSON.stringify({
                type: "match_start",
                roomId,
                playerIndex: 1,
                opponentName: p1.name,
                foods: initialFoods,
                p1Spawn: { x: 200, y: 400, angle: 0 },
                p2Spawn: { x: 600, y: 400, angle: Math.PI }
              }));
            } else {
              // Tell client they are waiting
              ws.send(JSON.stringify({
                type: "waiting_for_opponent"
              }));
            }
            break;
          }

          case "player_update": {
            // Forward player update to opponent
            const roomId = data.roomId;
            const room = rooms.get(roomId);
            if (room) {
              const opponent = room.players.find(p => p.ws !== ws);
              if (opponent && opponent.ws.readyState === WebSocket.OPEN) {
                opponent.ws.send(JSON.stringify({
                  type: "opponent_update",
                  segments: data.segments,
                  angle: data.angle,
                  score: data.score,
                  boostActive: data.boostActive
                }));
              }
            }
            break;
          }

          case "eat_food": {
            const roomId = data.roomId;
            const room = rooms.get(roomId);
            if (room) {
              const foodIndex = data.foodIndex;
              if (foodIndex >= 0 && foodIndex < room.foods.length) {
                // Remove the food and spawn a new one
                room.foods.splice(foodIndex, 1);

                const colorsPool = ['#ff4da6', '#bd00ff', '#39ff14', '#00f0ff', '#fffb00', '#ff9900'];
                const newFood = {
                  x: Math.random() * 740 + 30,
                  y: Math.random() * 740 + 30,
                  val: 10,
                  radius: 4 + Math.random() * 2,
                  color: colorsPool[Math.floor(Math.random() * colorsPool.length)],
                  isOrb: false,
                  pulse: Math.random() * Math.PI
                };

                room.foods.push(newFood);

                // Broadcast to both players
                const payload = JSON.stringify({
                  type: "food_update",
                  foodIndex,
                  newFood
                });

                room.players.forEach(p => {
                  if (p.ws.readyState === WebSocket.OPEN) {
                    p.ws.send(payload);
                  }
                });
              }
            }
            break;
          }

          case "drop_food_bulk": {
            const roomId = data.roomId;
            const room = rooms.get(roomId);
            if (room) {
              const drops = data.drops;
              room.foods.push(...drops);

              const payload = JSON.stringify({
                type: "food_bulk_added",
                drops
              });

              room.players.forEach(p => {
                if (p.ws.readyState === WebSocket.OPEN) {
                  p.ws.send(payload);
                }
              });
            }
            break;
          }

          case "game_over": {
            const roomId = data.roomId;
            const room = rooms.get(roomId);
            if (room) {
              const loserIndex = data.loserIndex;
              const reason = data.reason;

              const payload = JSON.stringify({
                type: "match_over",
                loserIndex,
                reason
              });

              room.players.forEach(p => {
                if (p.ws.readyState === WebSocket.OPEN) {
                  p.ws.send(payload);
                }
              });

              rooms.delete(roomId);
            }
            break;
          }

          case "cancel_matchmaking": {
            cleanupPlayer(ws);
            break;
          }
        }
      } catch (err) {
        console.error("Error processing message:", err);
      }
    });

    ws.on("close", () => {
      cleanupPlayer(ws);
    });

    ws.on("error", (err) => {
      console.error("WebSocket error:", err);
      cleanupPlayer(ws);
    });
  });

  // Handle upgrade request
  httpServer.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
    if (pathname === "/ws") {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Serve API routes first
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
