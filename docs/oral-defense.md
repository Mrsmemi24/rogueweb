# Explicación breve para la defensa oral

## Arquitectura

RogueWeb tiene dos modos. `/solo` funciona en el navegador y se puede jugar sin
cuenta. `/jugar` utiliza un servidor Node.js separado con Socket.IO. Phaser
dibuja el tablero, pero no decide el estado real de una partida en línea.

## Identidad y seguridad

Auth.js permite iniciar sesión con GitHub y conserva una sesión JWT. El servidor
web crea un token Socket.IO firmado que dura 60 segundos. El backend comprueba
firma, emisor, audiencia y vencimiento antes de aceptar la conexión. La
identidad estable proviene de la cuenta validada, no de un `playerId` enviado
por el navegador.

El cliente sólo envía intenciones, como una dirección para moverse o atacar.
El backend valida el esquema y la membresía de la sala, calcula colisiones,
turnos de enemigos, daño, vida, experiencia, nivel y victoria/derrota. También
limita la cantidad de eventos para evitar spam. Esos límites viven en memoria
de cada proceso, así que varias réplicas necesitarían compartirlos.

## Guardado de partidas

Cuando el servidor detecta que la partida terminó, crea un identificador único
y genera los resultados desde su propio estado. Envía el resumen firmado al
servidor web, que guarda una fila por participante en PostgreSQL mediante
Prisma. La clave única `(matchId, playerId)` evita duplicar filas al reintentar.
La migración que agrega esa clave todavía no se aplicó a Supabase.

La pantalla `/historial` consulta sólo las partidas de la cuenta autenticada y
no muestra inventario ni registros de otros usuarios. Prisma 7 usa el adaptador
PostgreSQL `PrismaPg`; no se ejecutó una escritura ni se repitió el seed de
10.000 filas.

## Reconexión y reinicio

La identidad del usuario no depende del ID temporal del socket. Si la conexión
se corta, el servidor conserva al jugador durante un período de gracia y
permite recuperar la misma sala. Si se conecta otra sesión de la misma cuenta,
la conexión anterior se sustituye. Al expirar el período y salir todos, se
elimina la sala en memoria.

El host puede reiniciar una partida terminada. El mapa y los metadatos se
regeneran y los jugadores vuelven a estadísticas iniciales; no se heredan HP,
XP ni inventario.

## Pasos externos pendientes

Para que funcione OAuth real hay que crear una GitHub OAuth App y configurar
`AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET` y `AUTH_SECRET` localmente y en el host.
El callback local es
`http://localhost:3000/api/auth/callback/github`; producción requiere el mismo
camino bajo el dominio HTTPS elegido. `SOCKET_AUTH_SECRET` debe ser un secreto
independiente compartido por web y backend.

También falta elegir un host compatible con WebSockets persistentes y
configurar PostgreSQL, HTTPS/WSS, `CLIENT_ORIGIN`, `NEXT_PUBLIC_SOCKET_URL` y
`MATCH_HISTORY_URL`. Antes de aplicar la migración a Supabase se debe revisar
el SQL y obtener aprobación. La rúbrica oficial todavía debe confirmar qué
representan las 10.000 filas.
