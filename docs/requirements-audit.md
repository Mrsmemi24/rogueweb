# Auditoría de requisitos — RogueWeb: Echoes of the Grid

## Alcance y límites de verificación

Esta auditoría corresponde al código actual del repositorio. No se encontró
una rúbrica o documento oficial que defina el requisito de 10.000 registros.
El usuario confirmó previamente una consulta de solo lectura con 10.000 filas
existentes, pero no se repitió el conteo durante esta implementación. No se
ejecutaron seeds, migraciones contra la base, `reset`, `drop` ni escrituras
externas. La migración de idempotencia añadida al repositorio todavía requiere
revisión y aprobación antes de aplicarse a Supabase.

`PASS` indica que la evidencia local descrita existe y que las pruebas citadas
se ejecutaron. OAuth real, móvil físico, la base externa y un proveedor de
alojamiento requieren verificación manual y no se marcan como aprobados.

## Matriz de requisitos

| Requisito | Estado | Evidencia y verificación | Trabajo pendiente | Prioridad |
|---|---|---|---|---|
| Rúbrica oficial y significado de las 10.000 filas | NEEDS MANUAL VERIFICATION | No se localizó una fuente oficial. [`README.md`](../README.md) y [`prisma/seed.ts`](../prisma/seed.ts) describen `MatchHistory`, pero no prueban qué pide la rúbrica. | Confirmar si son partidas, usuarios u otra entidad, y si se requiere exactamente 10.000 o al menos esa cantidad. | high |
| Conteo de registros existente y conservación de muestras | NEEDS MANUAL VERIFICATION | El usuario confirmó previamente un conteo de solo lectura de 10.000 filas. En esta continuación no se volvió a consultar la base; no se ejecutó el seed ni ninguna operación DB de escritura. | Repetir conteo de solo lectura aprobado si se necesita evidencia actual. No volver a ejecutar el seed contra la base existente. | high |
| Frontend Next.js, React, TypeScript y Phaser; modos `/solo` y `/jugar` | PASS | [`src/app/solo/page.tsx`](../src/app/solo/page.tsx), [`src/app/jugar/page.tsx`](../src/app/jugar/page.tsx), [`src/components/PhaserGame.tsx`](../src/components/PhaserGame.tsx) y [`src/components/OnlineGame.tsx`](../src/components/OnlineGame.tsx). El build de producción y `npx tsc --noEmit` finalizaron correctamente. | Ejecutar la comprobación manual de escritorio y móvil descrita abajo. | medium |
| Backend Socket.IO separado y estado autoritativo | PASS | [`server/src/index.ts`](../server/src/index.ts), [`server/src/game.ts`](../server/src/game.ts); movimiento, colisiones, combate, turnos, HP, XP y estados terminales se calculan en backend. Las pruebas de juego y Socket.IO comprueban estado compartido, payloads manipulados y límites. | Ninguno para la ejecución local; despliegue pendiente. | medium |
| Prisma 7, PostgreSQL, modelo e idempotencia de historial | PASS para el esquema local; NEEDS MANUAL VERIFICATION para la base | [`prisma/schema.prisma`](../prisma/schema.prisma) conserva los campos existentes y agrega `matchId` nullable con unicidad `(matchId, playerId)`. [`prisma/migrations/20261018190000_match_history_idempotency/migration.sql`](../prisma/migrations/20261018190000_match_history_idempotency/migration.sql) es aditiva. `npx prisma validate` y `npx prisma generate` pasaron con una URL ficticia local; no contactaron PostgreSQL. | Revisar y aprobar la migración antes de aplicarla a Supabase; no se aplicó en esta tarea. | high |
| Seed seguro al repetir | PASS para repetición secuencial; NEEDS MANUAL VERIFICATION para concurrencia | [`prisma/seed.ts`](../prisma/seed.ts) cuenta todas las filas, calcula el faltante y usa lotes `createMany` de hasta 500. No borra datos. | Dos procesos concurrentes aún pueden insertar filas lógicas duplicadas por la estrategia count-then-insert. No se ejecutó el seed. | medium |
| OAuth, sesiones y protección de `/jugar` | NEEDS MANUAL VERIFICATION | [`src/auth.ts`](../src/auth.ts) integra Auth.js con GitHub y sesión JWT; la identidad se construye en servidor como `github:<providerAccountId>`. [`src/app/jugar/page.tsx`](../src/app/jugar/page.tsx) requiere sesión; `/solo` no. [`src/app/api/socket-token/route.test.ts`](../src/app/api/socket-token/route.test.ts) prueba sesión ausente, emisión y fallo cerrado; [`src/lib/socket-token.test.ts`](../src/lib/socket-token.test.ts) prueba firma/expiración. | Crear/configurar la OAuth App y verificar login, callback y logout localmente. La URL esperada es `/api/auth/callback/github`; no se usaron credenciales reales. | high |
| Token e identidad Socket.IO | PASS en pruebas locales; NEEDS MANUAL VERIFICATION en OAuth real | [`src/app/api/socket-token/route.ts`](../src/app/api/socket-token/route.ts) emite token de 60 s sólo para una sesión autenticada. [`server/src/auth.ts`](../server/src/auth.ts) valida firma HS256, issuer, audience, subject y expiración. El socket desconecta al vencer el token y el cliente solicita uno nuevo al reconectar. | Confirmar configuración segura e igual de `SOCKET_AUTH_SECRET` en ambos procesos. | high |
| Membresía, validación y autoridad de eventos | PASS para las rutas probadas | [`server/src/index.ts`](../server/src/index.ts) deriva usuario/sala del socket autenticado, aplica esquemas Zod estrictos y rechaza payloads que intentan suplantar `playerId`/`userId`. Las pruebas de integración cubren acciones sin membresía. Coordenadas, daño, HP, XP e inventario no son autoridad del navegador. | La sala es pública para quien conoce su ID; no existe concepto de salas privadas/invitaciones. | high |
| Rate limiting de eventos y handshakes | PASS | [`server/src/rate-limit.ts`](../server/src/rate-limit.ts) limita eventos por ventana de 10 s, `lobby:join` a 8, limita handshakes por dirección remota directa, acota direcciones almacenadas y limpia estado de socket al desconectar. [`server/src/socket.integration.test.ts`](../server/src/socket.integration.test.ts) prueba que el noveno join no crea la sala destino. | Los límites y timers son en memoria y por proceso; no son distribuidos entre réplicas. El backend no confía en `X-Forwarded-For`. | high |
| Persistencia de partidas terminales | NEEDS MANUAL VERIFICATION | [`server/src/match-history.ts`](../server/src/match-history.ts) prepara snapshots solo desde estado terminal, con identidad estable y datos sanitizados, y hace reintentos firmados. [`src/app/api/internal/match-history/route.ts`](../src/app/api/internal/match-history/route.ts) valida token, esquema y escribe con `createMany(skipDuplicates: true)`. Pruebas mock verifican resultado, participantes e idempotencia. | La escritura real a PostgreSQL no se probó; primero debe aplicarse la migración aprobada y configurarse `MATCH_HISTORY_URL`/`SOCKET_AUTH_SECRET`. Los errores quedan registrados sin el payload personal. | high |
| API privada y pantalla de historial | PASS en pruebas de API; NEEDS MANUAL VERIFICATION visual | [`src/app/api/telemetry/route.ts`](../src/app/api/telemetry/route.ts) requiere sesión, filtra por `playerId` autenticado y pagina con límite máximo; no devuelve `inventory` ni registros de otros usuarios. [`src/app/historial/page.tsx`](../src/app/historial/page.tsx) y [`src/components/MatchHistory.tsx`](../src/components/MatchHistory.tsx) presentan fecha, resultado, nivel, duración y enemigos, con estados de carga, vacío y error. | Revisar el flujo en navegador con historial vacío y poblado; la API se probó con mocks, no DB real. | high |
| Reconexión y sesiones Socket.IO duplicadas | PASS en integración | [`server/src/index.ts`](../server/src/index.ts) conserva al usuario durante `RECONNECT_GRACE_MS` (30 s por defecto), reanuda con el mismo ID de jugador, limpia al expirar y sustituye la conexión anterior. [`server/src/socket.integration.test.ts`](../server/src/socket.integration.test.ts) cubre reemplazo, reconexión dentro del período y limpieza tras expiración. | Estado en memoria: un reinicio del backend pierde salas y grace timers. | medium |
| Reinicio de partida terminal | NEEDS MANUAL VERIFICATION | El backend solo permite reiniciar salas terminales al host autenticado; reinicia dungeon, jugadores, ready flags y metadatos. [`server/src/game.test.ts`](../server/src/game.test.ts) valida el reset; la integración valida rechazo de jugador no host y rechazo mientras la partida sigue activa. La UI expone el botón solo al host en estado terminal. | No se automatizó una partida completa hasta victoria/derrota seguida de reinicio en navegador; verificar manualmente ese recorrido. | medium |
| Controles de escritorio/móvil | NEEDS MANUAL VERIFICATION | [`src/components/OnlineGame.tsx`](../src/components/OnlineGame.tsx) conserva teclado y controles táctiles, cancela movimiento en `pointerup`, `pointercancel`, pérdida de foco y ocultamiento; el ciclo táctil emite a 180 ms y el servidor impone cooldowns. | Probar en navegador móvil real, orientación, toque sostenido, cancelar gesto y volver a foco. | medium |
| CI en GitHub Actions | PASS para workflow; NEEDS MANUAL VERIFICATION para ejecución alojada | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) usa `npm ci` para ambas carpetas, Prisma validate/generate, frontend test/typecheck/lint/build y backend build/test, con credenciales ficticias y URL DB de CI. | No se consultó una ejecución alojada de GitHub Actions. | medium |
| Avisos de dependencias | NEEDS MANUAL VERIFICATION | La instalación de dependencias al agregar Auth.js/JOSE reportó cinco avisos de severidad alta. No se ejecutó `npm audit fix` ni se cambiaron versiones transitivas por fuerza. | Ejecutar revisión de avisos y planear actualizaciones específicas; evitar fixes automáticos sin revisar compatibilidad. | high |
| CORS, salud, apagado y despliegue | PASS en configuración local; NEEDS MANUAL VERIFICATION en host | [`server/src/index.ts`](../server/src/index.ts) ofrece `/health`, `HOST` configurable, `CLIENT_ORIGIN` exacto, no acepta origen ausente en producción y cierra sockets/timers en SIGINT/SIGTERM. [`README.md`](../README.md) detalla HTTPS/WSS, callbacks y variables por nombre. | Elegir un proveedor con WebSocket persistente; configurar `HOST=0.0.0.0`, origen y URL HTTPS en el host, TLS/WSS, OAuth callbacks y conectividad PostgreSQL. No se desplegó. | high |
| Protección de secretos | PASS en el diff local inspeccionado | [`.gitignore`](../.gitignore) ignora `.env*` excepto [`.env.example`](../.env.example), que sólo contiene nombres y placeholders seguros. No se imprimió ni copió ningún valor local. | Configurar/rotar secretos en el proveedor cuando se elija; no compartirlos en chat ni subirlos al repositorio. | high |

## Prisma 7 y acceso a datos

- [`src/lib/prisma.ts`](../src/lib/prisma.ts) inicializa Prisma 7 usando
  `PrismaPg` y `DATABASE_URL`; mantiene el cliente en desarrollo.
- El seed está configurado en [`prisma.config.ts`](../prisma.config.ts) y
  [`prisma/seed.ts`](../prisma/seed.ts). No se ejecutó.
- La nueva migración es aditiva y no ha sido aplicada a una base externa.
- El flujo de generación Prisma se validó contra una URL PostgreSQL ficticia;
  no se abrió conexión a esa URL.

## Verificaciones ejecutadas en esta implementación

| Comando | Resultado |
|---|---|
| `npx prisma validate` con URL ficticia CI | PASS: esquema válido |
| `npx prisma generate` con URL ficticia CI | PASS: Prisma Client 7.10.1 generado |
| `npx tsc --noEmit` | PASS |
| `npm test -- --reporter=dot` | PASS: 99 pruebas en 12 archivos |
| `npm run lint` | PASS tras corregir errores detectados |
| `npm run build` con placeholders CI | PASS: Next.js 16.4.2 genera `/historial`, `/jugar` y APIs |
| `npm --prefix server run build` | PASS |
| `npm --prefix server test -- --reporter=dot` | PASS: 60 pruebas en 6 archivos |

Una primera compilación falló porque las rutas declaraban `runtime = "nodejs"`
con `cacheComponents: true`; la guía incluida con Next.js 16 indica eliminar
esa exportación. El build final pasó después de quitarla y colocar el acceso
dependiente de sesión dentro de límites `<Suspense>`.

## Pruebas manuales pendientes

1. Configurar GitHub OAuth local con callback
   `http://localhost:3000/api/auth/callback/github`; verificar login, callback,
   logout y acceso denegado a `/jugar` sin sesión.
2. Probar `/solo` sin cuenta y `/jugar` con dos usuarios en salas, teclado,
   combate, victoria/derrota, botón de reinicio del host y rechazo de reinicio
   por otros jugadores.
3. Probar pérdida temporal de red/reconexión y expiración después del período
   configurado; comprobar duplicados de sesión en dos pestañas.
4. Probar controles táctiles en un dispositivo físico, incluyendo toque
   sostenido, `pointercancel`, cambio de aplicación y orientación.
5. Tras aprobación explícita, revisar y aplicar la migración en el entorno
   elegido. Verificar guardado de partidas reales y paginación conectada a la
   base sin exponer inventarios ni partidas de otros usuarios.
6. Confirmar con la fuente oficial qué representan las 10.000 filas y volver a
   ejecutar un conteo de solo lectura si hace falta evidencia actual.
7. Elegir host, configurar variables, CORS exacto, HTTPS/WSS, WebSocket
   persistente, health check, OAuth callback de producción y conectividad DB.
8. Consultar la ejecución alojada de CI en GitHub; no se afirma que haya
   ocurrido en esta auditoría.
