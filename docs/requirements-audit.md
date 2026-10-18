# Auditoría final de requisitos — RogueWeb: Echoes of the Grid

## Alcance y fuente oficial

Se inspeccionó el repositorio real antes de cambiar código. No se encontró un
documento oficial de requisitos, rúbrica, archivo de aceptación ni instrucción
que defina qué debe contener el requisito de 10.000 registros. El README sí
describe una carga de 10.000 partidas de muestra y existe un modelo
`MatchHistory`; esto demuestra la implementación actual, no el significado
oficial del requisito. Se necesita confirmación del profesor/cliente antes de
asegurar que el total deba ser de partidas, usuarios u otra entidad.

Los estados siguientes describen evidencia presente en el repositorio y
verificaciones ejecutadas en este equipo. `PASS` no reemplaza pruebas manuales
de dispositivo o de producción.

## Matriz de requisitos

| Requisito | Estado | Evidencia y verificación | Trabajo pendiente | Prioridad |
|---|---|---|---|---|
| Documento oficial y significado de las 10.000 filas | NEEDS MANUAL VERIFICATION | No se localizó especificación oficial. [`README.md`](../README.md), [`prisma/seed.ts`](../prisma/seed.ts) y [`check-count.mjs`](../check-count.mjs) hablan de partidas `MatchHistory`. | Obtener la rúbrica/fuente oficial y confirmar entidad, si son datos de prueba o partidas reales, y si el total debe ser exactamente 10.000 o al menos 10.000. | high |
| Frontend Next.js, React, TypeScript, Phaser; rutas `/solo` y `/jugar` | PASS | [`package.json`](../package.json), [`src/app/solo/page.tsx`](../src/app/solo/page.tsx), [`src/app/jugar/page.tsx`](../src/app/jugar/page.tsx), componentes Phaser. `npm run build` y `npx tsc --noEmit` terminaron correctamente. | Pruebas manuales de navegador/dispositivo descritas abajo. | medium |
| Backend Node.js/TypeScript y Socket.IO separado | PASS | [`server/package.json`](../server/package.json), [`server/src/index.ts`](../server/src/index.ts). `npm --prefix server run build` pasó. | Ninguno para el requisito local; aún falta despliegue. | low |
| Prisma 7, PostgreSQL, migración y modelo `MatchHistory` | PASS | [`prisma/schema.prisma`](../prisma/schema.prisma) define los nueve campos solicitados e índices; [`prisma.config.ts`](../prisma.config.ts) configura schema, migraciones, seed y datasource; la migración inicial está aplicada. `npx prisma migrate status`: “Database schema is up to date!”. | Confirmar que la entidad/modelo coincide con la fuente oficial. | medium |
| Total actual de registros requeridos | PASS, sujeto a confirmar el requisito oficial | [`check-count.mjs`](../check-count.mjs) consultó PostgreSQL sin imprimir la URL: `Total de partidas guardadas: 10000`; `Faltan para 10,000: 0`. Repetido después de los cambios: mismo resultado. | Confirmar que el requisito cuenta filas de `MatchHistory` y no otra tabla o conjunto de datos. | high |
| Seed por lotes y repetición | NEEDS MANUAL VERIFICATION | [`prisma/seed.ts`](../prisma/seed.ts) cuenta la tabla completa, calcula el faltante y escribe lotes de hasta 500 mediante `createMany`. Con 10.000 filas, el código no inserta más. No se ejecutó `prisma db seed` durante esta auditoría, para evitar escrituras innecesarias. | La operación secuencial ya completada es no-op, pero dos seeds simultáneos pueden leer el mismo conteo e insertar filas duplicadas lógicamente: no existe clave única de semilla ni bloqueo. No ejecutar concurrentemente; decidir si hace falta reforzar concurrencia una vez aclarado el requisito. | medium |
| Login OAuth, callback, sesiones y rutas protegidas | FAIL | No se encontraron proveedor/biblioteca OAuth, callbacks, modelo/almacén de sesión ni middleware/rutas de autorización. [`src/app/api/telemetry/route.ts`](../src/app/api/telemetry/route.ts) es una ruta pública GET y devuelve `playerId`, `playerName`, `inventory` y datos de partida. | Confirmar proveedor y URLs autorizadas; implementar autenticación, sesiones, autorización en cada endpoint y protección de los datos de telemetría. Requiere decisión y credenciales externas. | high |
| Identidad autenticada en Socket.IO | FAIL | [`server/src/index.ts`](../server/src/index.ts) usa el `socket.id` emitido por Socket.IO para la identidad efímera y `playerName` proviene del payload del cliente. No hay middleware de autenticación ni identidad OAuth validada. El cliente no puede elegir directamente su `socket.id`, pero tampoco hay una identidad de usuario autenticada. | Validar la sesión/token en el handshake; vincular jugador a un identificador autenticado y no aceptar nombres como prueba de identidad. Coordinar con el proveedor OAuth aprobado. | high |
| Membresía de sala y validación de payloads | PASS para salas públicas | Los eventos de ready/move/attack obtienen sala desde `socket.data.roomId` y jugador desde `socket.id`; no aceptan `roomId` ni coordenadas/damage en esos eventos. `JoinRoomSchema`, `ReadySchema`, `MoveIntentSchema` y `AttackIntentSchema` son estrictos y validan forma/rangos. [`server/src/game.test.ts`](../server/src/game.test.ts), [`server/src/index.ts`](../server/src/index.ts). | Las salas son públicas y el usuario elige un nombre/ID de sala. Si se necesitan salas privadas, definir autorización y códigos/tokens de invitación. | medium |
| Rate limiting del servidor | FAIL para límites generales; PASS para cooldown de juego | [`server/src/game.ts`](../server/src/game.ts) aplica cooldown de 150 ms para movimiento y 250 ms para ataque. No hay límite general de eventos/conexiones por cliente ni protección contra inundación de `lobby:join`/payloads. | Añadir límite de mensajes/conexiones, idealmente complementado con límites del host/proxy. | high |
| Movimiento, combate y estado multijugador autoritativo | PASS | [`server/src/game.ts`](../server/src/game.ts) calcula movimiento, colisiones, ataque, turnos de enemigos, HP, XP, nivel, derrota y estado público; el cliente envía intenciones. Pruebas de [`server/src/game.test.ts`](../server/src/game.test.ts) y [`server/src/socket.integration.test.ts`](../server/src/socket.integration.test.ts). Build backend y 40 pruebas pasaron. | Añadir casos de integración para payloads inválidos/eventos no autorizados si la matriz de pruebas de seguridad lo requiere. | medium |
| Victoria, derrota y reinicio | PASS para estados terminales; FAIL para reinicio dentro del juego | El servidor fija victoria al llegar a la salida y derrota si todos los jugadores caen; bloquea acciones en salas terminadas. Las pruebas cubren victoria, HP cero, XP y progresión. No hay acción/control de reinicio de sala: la sala se elimina cuando el último socket sale; volver a entrar crea otra partida. | Añadir flujo de abandonar/reiniciar acordado, o documentar que salir y volver a crear sala es el flujo esperado. | medium |
| Desconexión y reconexión | PASS para limpieza; FAIL para reanudar estado | [`server/src/index.ts`](../server/src/index.ts) elimina al jugador desconectado y borra la sala cuando queda vacía. [`src/components/OnlineGame.tsx`](../src/components/OnlineGame.tsx) limpia estado al desconectar, pero no restaura la partida/identidad al reconectar; la nueva conexión necesita unirse otra vez y obtiene otro `socket.id`. | Definir si la reconexión debe recuperar estado. Si sí, usar identidad autenticada y una política de reconexión/expiración persistente. | medium |
| Guardar al completar una partida en PostgreSQL | FAIL (si es requisito) | El esquema tiene `MatchHistory`; [`src/app/api/telemetry/route.ts`](../src/app/api/telemetry/route.ts) solo ejecuta `findMany`/`count`; no se encontró `create`, `createMany` ni llamada del servidor de juego a Prisma. El seed crea datos de muestra, no guarda partidas reales. | Confirmar si el guardado de partidas reales es obligatorio. Si lo es, guardar desde lógica confiable del servidor al terminar y validar los campos/resultado; nunca confiar en estadísticas finales del navegador. | high |
| Controles de PC y móvil en ambos modos | NEEDS MANUAL VERIFICATION | PC: Phaser registra WASD/flechas y espacio en [`src/components/PhaserGame.tsx`](../src/components/PhaserGame.tsx) y [`src/components/AuthoritativeCanvas.tsx`](../src/components/AuthoritativeCanvas.tsx). Móvil: [`src/components/TouchControls.tsx`](../src/components/TouchControls.tsx) para solo y controles pointer en [`src/components/OnlineGame.tsx`](../src/components/OnlineGame.tsx); se detienen al soltar/cancelar/perder foco. | Probar físicamente teclado y táctil en ambos modos, incluyendo arrastrar fuera del botón, cambio de pestaña y foco perdido. | medium |
| Pruebas automatizadas locales | PASS | Después del cambio: `npm test -- --reporter=dot`: 63 pruebas/6 archivos; `npm --prefix server test -- --reporter=dot`: 40 pruebas/3 archivos; `npx tsc --noEmit`, `npm run lint`, `npm run build` y build backend pasaron. | Las pruebas no sustituyen la revisión manual ni cubren OAuth/producción, no implementados. | low |
| GitHub Actions CI | PASS para configuración y checks locales | [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) ejecuta build, TypeScript, tests y lint frontend; build/tests backend en `push` y `pull_request`. No requiere PostgreSQL hoy porque los tests no son tests de integración DB. | No se verificó una ejecución alojada de Actions en GitHub. Agregar servicio PostgreSQL/secrets de prueba si se añaden pruebas DB. | medium |
| Despliegue, CORS, HTTPS/WSS y DB en producción | FAIL / NEEDS MANUAL VERIFICATION | [`README.md`](../README.md) solo documenta desarrollo local. [`server/src/index.ts`](../server/src/index.ts) escucha en `127.0.0.1`, por lo que no acepta conexiones externas en un despliegue normal. CORS permite `CLIENT_ORIGIN`, orígenes localhost/127.0.0.1 y solicitudes sin cabecera `Origin`; el cliente usa `NEXT_PUBLIC_SOCKET_URL`. No hay proveedor/URL de despliegue definido. | Elegir host que soporte WebSocket persistente; enlazar interfaz de red adecuada; configurar origin exacto y política para solicitudes sin `Origin`, HTTPS/WSS, callback OAuth, `DATABASE_URL` y conectividad PostgreSQL en el host. Verificar conexión desde producción. | high |
| Protección de secretos | PASS en control de versiones; no auditado en proveedor remoto | [`.gitignore`](../.gitignore) excluye `.env*`; los comandos de conteo/migración no imprimieron valores de conexión. | Confirmar permisos/rotación en el host elegido; no subir valores reales al repositorio o logs. | high |

## Configuración y esquema observados

- El paquete raíz tiene scripts `dev`, `dev:socket`, `build`, `start`, `lint` y
  `test`. El proyecto no declara scripts `typecheck` ni pruebas DB.
- `server/` es un paquete npm separado con scripts `dev`, `build`, `start` y
  `test`.
- `prisma/schema.prisma` contiene únicamente el modelo `MatchHistory`, con
  `id`, `playerId`, `playerName`, `levelReached`, `enemiesDefeated`,
  `durationSeconds`, `inventory`, `result` y `createdAt`; hay índices por
  jugador, fecha y nivel. El resultado es `String`, no un enum validado por
  PostgreSQL.
- `prisma.config.ts` lee `DATABASE_URL` mediante `env(...)`. No se incluyen
  valores de variables ni URLs de conexión en este informe.
- Hay una migración inicial aplicada. No se ejecutaron `migrate dev`, `db
  push`, `db seed`, `reset`, `drop` ni otra operación de escritura.

## Cambio correctivo aplicado en esta auditoría

La línea base del build fallaba al construir `PrismaClient` sin adaptador, lo
que Prisma 7 exige. Se ajustó [`src/app/api/telemetry/route.ts`](../src/app/api/telemetry/route.ts)
para usar `PrismaPg` con `DATABASE_URL` y se agregó
[`src/app/api/telemetry/route.test.ts`](../src/app/api/telemetry/route.test.ts)
para comprobar la respuesta paginada. El build ahora reconoce `/api/telemetry`
como ruta dinámica y termina correctamente. El endpoint sigue siendo público;
este cambio no implementa ni simula autenticación.

También se corrigió la descripción del seed en [`README.md`](../README.md): el
código actual cuenta todas las filas y no borra/reemplaza filas de
`seed-player-*`; los lotes son secuenciales y no están protegidos frente a dos
ejecuciones simultáneas.

## Línea base y comandos

### Antes de corregir Prisma

- `npx tsc --noEmit`: pasó.
- `npm test -- --reporter=dot`: 62 pruebas/5 archivos pasaron.
- `npm run lint`: pasó.
- `npm run build`: falló al recopilar `/api/telemetry`: `PrismaClient was
  instantiated without any options. A driver adapter is required`.
- `npm --prefix server run build`: pasó.
- Primera ejecución de `npm --prefix server test -- --reporter=dot`: 39
  pruebas pasaron y falló temporalmente la conexión XHR de Socket.IO; la prueba
  de integración aislada pasó al repetirse.

### Después de corregir Prisma

- `npm test -- --reporter=dot`: 63 pruebas/6 archivos pasaron.
- `npm run build`: pasó; `/api/telemetry` aparece como dinámica.
- `npx tsc --noEmit`: pasó.
- `npm run lint`: pasó.
- `npm --prefix server run build`: pasó.
- `npm --prefix server test -- --reporter=dot`: 40 pruebas/3 archivos pasaron.
- `npx prisma migrate status`: una migración encontrada; esquema actualizado.
- `npx tsx check-count.mjs`: exactamente 10.000 filas en `MatchHistory`, 0
  faltantes.

La ejecución alojada de GitHub Actions, el flujo OAuth, dispositivos móviles y
el despliegue no se verificaron en este equipo.

## Pruebas manuales pendientes

1. Ejecutar `/solo` y `/jugar` con teclado: movimiento WASD/flechas, colisiones
   y ataque con espacio; verificar controles táctiles y cancelar movimiento al
   soltar o perder foco.
2. Abrir dos clientes en la misma sala y comprobar sincronización, combate,
   victoria/derrota, salida y reconexión según la política deseada.
3. Cuando se implemente OAuth, verificar callbacks de desarrollo/producción,
   expiración/cierre de sesión, rutas protegidas y que un cliente no pueda
   suplantar la identidad de otro.
4. En un host real, validar HTTPS/WSS, origen CORS autorizado, conectividad a
   PostgreSQL, persistencia del proceso Socket.IO y acceso a variables de
   entorno sin imprimirlas.
5. Confirmar con la fuente oficial qué representa la cantidad de 10.000 y
   verificar si `MatchHistory` es la entidad obligatoria.
