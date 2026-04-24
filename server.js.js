const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 });

const players = new Map(); // id -> { ws, position, rotationY, isMoving, aiming, health, dead }

function generateId() {
    return 'player_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
}

function getRespawnPoint() {
    return {
        x: (Math.random() - 0.5) * 100,
        y: 0,
        z: (Math.random() - 0.5) * 100
    };
}

function broadcast(data, excludeWs = null) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
            client.send(msg);
        }
    });
}

wss.on('connection', (ws) => {
    const id = generateId();
    const spawn = getRespawnPoint();
    const player = {
        ws,
        position: { x: spawn.x, y: spawn.y, z: spawn.z },
        rotationY: 0,
        isMoving: false,
        aiming: false,
        health: 100,
        dead: false
    };
    players.set(id, player);

    // Отправляем инициализацию новому игроку
    ws.send(JSON.stringify({
        type: 'init',
        id,
        position: player.position,
        health: player.health
    }));

    // Отправляем новому игроку список уже существующих
    const otherPlayers = [];
    players.forEach((p, pid) => {
        if (pid !== id) {
            otherPlayers.push({
                id: pid,
                position: p.position,
                rotationY: p.rotationY,
                isMoving: p.isMoving,
                aiming: p.aiming,
                health: p.health
            });
        }
    });
    if (otherPlayers.length > 0) {
        ws.send(JSON.stringify({ type: 'players', list: otherPlayers }));
    }

    // Оповещаем остальных о новом игроке
    broadcast({
        type: 'player_joined',
        id,
        position: player.position,
        rotationY: player.rotationY,
        health: player.health
    }, ws);

    ws.on('message', (data) => {
        let msg;
        try { msg = JSON.parse(data); } catch (e) { return; }
        if (!players.has(id)) return;

        switch (msg.type) {
            case 'update':
                player.position = msg.position;
                player.rotationY = msg.rotationY;
                player.isMoving = msg.isMoving;
                player.aiming = msg.aiming;
                broadcast({
                    type: 'player_update',
                    id,
                    position: player.position,
                    rotationY: player.rotationY,
                    isMoving: player.isMoving,
                    aiming: player.aiming,
                    health: player.health
                }, ws);
                break;

            case 'hit':
                // Проверяем, что цель существует и жива
                if (!players.has(msg.targetId)) break;
                const target = players.get(msg.targetId);
                if (target.dead || target.health <= 0) break;

                // Простейшая проверка дистанции (чтобы не стреляли через всю карту)
                const dx = player.position.x - target.position.x;
                const dz = player.position.z - target.position.z;
                const dist = Math.sqrt(dx * dx + dz * dz);
                if (dist > 80) break; // слишком далеко

                target.health -= 50;
                // Отправляем цели обновление здоровья
                target.ws.send(JSON.stringify({
                    type: 'health_update',
                    health: target.health
                }));

                // Всем событие урона (для эффектов можно)
                broadcast({
                    type: 'player_damaged',
                    id: msg.targetId,
                    health: target.health
                });

                if (target.health <= 0) {
                    // Смерть
                    target.dead = true;
                    target.health = 0;
                    broadcast({ type: 'player_killed', id: msg.targetId, by: id });

                    // Респавн через 3 секунды
                    setTimeout(() => {
                        if (!players.has(msg.targetId)) return;
                        const respawn = getRespawnPoint();
                        target.position = respawn;
                        target.health = 100;
                        target.dead = false;
                        players.get(msg.targetId).ws.send(JSON.stringify({
                            type: 'respawn',
                            position: target.position,
                            health: 100
                        }));
                        broadcast({
                            type: 'player_respawned',
                            id: msg.targetId,
                            position: target.position,
                            health: 100
                        });
                    }, 3000);
                }
                break;
        }
    });

    ws.on('close', () => {
        players.delete(id);
        broadcast({ type: 'player_left', id });
    });
});

console.log('Сервер запущен на порту 8080');