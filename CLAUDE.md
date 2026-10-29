# CLAUDE.md

Guía para trabajar en este repositorio.

## Qué es

CRM operativo de **Dicampo** (https://dicampo.co/), fabricante de pulpa de fruta
congelada 100% natural que vende B2B en Bogotá a restaurantes, fruterías,
panaderías, comidas rápidas y cafeterías. Los pedidos entran por WhatsApp y
teléfono.

Cubre el ciclo completo: prospecto → cliente → pedido → despacho → entrega, con
inventario por lote (obligatorio: es producto congelado con fecha de
vencimiento).

Sustituye a `../dicampo-app-pedidos`, que usa Contentful como base de datos.

## Comandos

```bash
npm run dev          # servidor de desarrollo
npm run build        # prisma generate + next build
npm run typecheck    # tsc --noEmit
npm run lint
npm run test         # vitest run
npm run test:watch

npm run db:migrate   # crea y aplica una migración (desarrollo)
npm run db:deploy    # aplica migraciones pendientes (producción)
npm run db:seed      # datos maestros: sabores, zonas, precios, admin
npm run db:studio    # explorador de datos
npm run db:reset     # ⚠️ borra la base y vuelve a sembrar

npx tsx scripts/verificar-carga-masiva.ts   # carga masiva de punta a punta
npx tsx scripts/normalizar-whatsapp.ts      # llena Contact.whatsappE164 (--aplicar para escribir)

# Regresión de la API del agente por HTTP (52 comprobaciones). DATABASE_URL
# debe ser la base del CRM que se prueba: con ella borra lo que crea
# (números 57300000090X, clientes ZZVERIF).
CRM_URL=https://crm.dicampo.co AGENTE_API_KEY=... npx tsx scripts/verificar-api-agente.ts
npx tsx scripts/verificar-disponibilidad.ts  # horario de visitas por asesor, de punta a punta
npx tsx scripts/cargar-catalogo.ts               # productos, fruta base, rendimientos y listas por nivel (--aplicar); DATABASE_URL = la base a cargar
npx tsx scripts/importar-cotizaciones.ts Base.xlsx   # histórico del Excel comercial (--aplicar, --crear-clientes)
```

## Arquitectura

**Regla central: la lógica de negocio vive en `src/server/services/`.**

- Los **route handlers** (`src/app/api/**`) son una capa delgada: validan con
  Zod, llaman a un servicio y devuelven el resultado. No contienen reglas.
- Los **Server Components** leen llamando a **los mismos servicios**
  directamente, sin dar un salto HTTP innecesario.
- Las **mutaciones** desde el navegador pasan siempre por `/api`, usando
  `src/lib/api-client.ts`.

Así la lógica se escribe una vez y la API queda lista para integraciones
futuras (bot de WhatsApp, app del repartidor).

```
src/
├─ app/
│  ├─ (auth)/login/     pantalla pública
│  ├─ (crm)/            área privada (layout con navegación por rol)
│  └─ api/              API interna
├─ server/
│  ├─ db.ts             singleton de Prisma
│  ├─ auth.ts           Auth.js v5 (Node)
│  ├─ auth.config.ts    config compartida con el middleware (Edge)
│  ├─ guards.ts         requireUser / scopeToOwnPortfolio / requireAgent
│  ├─ agent-auth.ts     API key del agente IA (n8n)
│  ├─ storage.ts        Supabase Storage: URLs firmadas de wa-media
│  ├─ locks.ts          candados de Postgres por llave (pg_advisory_xact_lock)
│  ├─ errors.ts         errores de dominio, sin saber de HTTP
│  ├─ http.ts           ok() / route() / traducción de errores
│  ├─ import/           motor de carga masiva (lee archivo, ejecuta filas)
│  ├─ services/         ← la lógica de negocio
│  └─ validators/       esquemas Zod, compartidos con los formularios
├─ components/ui/       primitivos (tokens estilo shadcn, Tailwind v4)
├─ lib/                 lógica pura: totales, FEFO, formateo COP, NIT, WhatsApp
│  └─ import/           parseo de CSV, cotejo de columnas, catálogo de campos
└─ generated/prisma/    cliente generado (NO se versiona)
```

## Convenciones

- **Idioma**: enums y valores de negocio en **español** (coinciden con cómo se
  habla en la operación); nombres de modelos, campos y código en **inglés**.
  Toda la interfaz y los mensajes de error, en español.
- **Autorización**: *no* se usa RLS de Supabase. Prisma conecta con un rol
  privilegiado, así que **todo** handler y toda página privada debe empezar
  comprobando permisos. Un `VENDEDOR` solo ve su cartera
  (`scopeToOwnPortfolio`).
  - En **route handlers**: `requireUser(roles)` / `requireAdmin()`, que lanzan
    y se traducen a 401/403 con cuerpo JSON.
  - En **páginas**: `requireUserPage(roles)` / `requireAdminPage()`, que
    redirigen. Lanzar desde un Server Component sale con estado **500**: un
    rechazo de permisos quedaría contado como fallo del servidor.
  - Ojo: `requireUser([])` **no** restringe — una lista vacía significa
    "cualquier usuario con sesión". Para exigir ADMIN usa `requireAdmin()`.
- **Errores**: los servicios lanzan las clases de `server/errors.ts`; `route()`
  las traduce a códigos HTTP. Nunca devuelvas `NextResponse` de error a mano.
- **Etiquetas**: el texto de cualquier enum sale de `src/lib/labels.ts`. No
  escribas literales de estado en las pantallas.
- **Marca**: el logotipo está en `public/dicampo-logo.png` y se usa vía
  `components/layout/logo.tsx`; el favicon (`src/app/icon.png`) es la "D"
  recortada. Los colores exactos son verde `#5bb040` y naranja `#ec6928`,
  pero **el verde de marca solo da 2,7:1 sobre blanco**: se reserva para el
  logo. Los botones, enlaces y el anillo de foco usan `--primary` (#40822e,
  4,7:1) y el texto sobre fondos tenues usa `--primary-strong` (#2f6122).
  Al tocar la paleta, vuelve a comprobar los contrastes.
- **Dinero**: `Decimal(14,2)` en base, COP sin centavos en pantalla vía
  `formatCOP`. Prisma devuelve `Decimal`, no `number`: usa los formateadores.
- **Totales y FEFO**: la aritmética pura vive en `src/lib/order-math.ts` y
  `src/lib/fefo.ts`, fuera de los servicios, para poder probarla sin base de
  datos y para que el formulario muestre exactamente la misma cifra que
  persiste el servidor. El precio definitivo lo decide **siempre** el servidor.
- **Formularios**: `react-hook-form` + `zodResolver`, reutilizando el esquema de
  `server/validators/`. Usa los tres genéricos de `useForm<Form, unknown,
  Output>` porque `.default()` hace que entrada y salida difieran.
- **Vendedor del pedido** (`resolveOrderSeller` en `services/orders.ts`): un
  VENDEDOR siempre vende a su nombre; un ADMIN elige a quién atribuir la venta
  en el formulario y, si no elige, es del responsable del cliente. Convertir
  una cotización la atribuye a quien cotizó. Un ADMIN corrige el vendedor de
  cualquier pedido, en cualquier estado (`PATCH /api/pedidos/:id/vendedor`):
  es lo que cuentan metas y reportes.
- **Histórico inmutable**: `OrderItem` guarda *snapshots* de nombre, SKU,
  presentación, precio **e IVA**. Cambiar el catálogo o subir la lista de
  precios no altera ningún pedido ya creado; los nuevos sí toman los valores
  actualizados. Está verificado end-to-end: no lo rompas al tocar pedidos.
- **Catálogo**: escritura solo para ADMIN — los precios son decisión comercial,
  no de operación. Productos y variantes **no se borran**, se desactivan
  (los pedidos históricos los referencian). El SKU se genera del sabor con
  `buildSku`; el IVA se elige de una lista cerrada (0/5/19 %) porque escribir
  "19" en vez de "0.19" multiplicaría el impuesto por cien.

## Detalles del stack que muerden

- **Prisma 7**: el bloque `datasource` **no** lleva `url` (va en
  `prisma.config.ts`); `output` es obligatorio en el generator; se importa desde
  `@/generated/prisma/client`; los **driver adapters son obligatorios**
  (`@prisma/adapter-pg`). Ya no hay motor Rust, así que **no** hacen falta
  `binaryTargets` para Netlify.
- **Dos URLs de Supabase**: `DATABASE_URL` es el pooler (puerto 6543,
  `pgbouncer=true`) y lo usa la app; `DIRECT_URL` es la conexión directa
  (puerto 5432) y solo la usa el CLI de Prisma. Las migraciones no funcionan
  sobre PgBouncer.
- **Auth.js v5**: el proveedor Credentials obliga a `session.strategy = "jwt"`.
  El middleware corre en Edge, por eso `auth.config.ts` no importa Prisma ni
  bcrypt.
- **La API está FUERA del middleware** (`matcher` excluye `/api`). Si se incluye,
  un endpoint sin sesión responde 307 hacia /login con HTML, y quien llama
  espera JSON. La protección la da `requireUser()` en cada handler, que
  produce un 401 con cuerpo JSON.
- **Consecutivos**: `Client.sequence` y `Order.orderNumber` son
  `@default(autoincrement())` de Postgres. Nunca los generes contando filas.
- **Zona horaria: todo en hora de Bogotá** (`BUSINESS_TIME_ZONE` en
  `lib/format.ts`). Netlify corre en **UTC**: nada que dependa de "hoy" o de
  la hora puede usar la zona del servidor (`new Date(y, m, d)`, `getHours()`,
  `format()` de date-fns sin zona). Se usa `TZDate` de `@date-fns/tz`.
  - **Momentos** (creación, pedido, actividad, mensajes): `formatDate` /
    `formatDateTime`, ya en hora de Bogotá.
  - **Fechas de calendario** (vencimiento y producción de lote, entrega
    pedida, fecha de ruta, cierre esperado): `formatCalendarDate`. Un
    `<input type="date">` validado con `z.coerce.date()` queda a medianoche
    UTC; leído en Bogotá saldría el día anterior.
  - **Filtros de rango** (reportes, conversaciones): `localDateSchema` da la
    medianoche de Bogotá y `endOfBusinessDay` el último milisegundo de ese
    día; los periodos ("este mes", "últimos 30") se calculan en Bogotá. Un
    pedido de las 8 p. m. del 31 cuenta en ese mes, no en el siguiente.
  - **Fecha compromiso de una actividad**: `businessDateSchema` toma
    "AAAA-MM-DD" como el inicio de ese día en Bogotá y respeta una fecha con
    hora (las visitas que agenda el agente).
  - **Excel**: no tiene zonas; `toExcelDate` escribe los momentos con la hora
    de Bogotá y deja las fechas de calendario (medianoche UTC) igual.
  - Las pruebas de `lib/format.test.ts` y `validators/reports.test.ts` deben
    pasar con `TZ=UTC` y `TZ=America/Bogota`.
- **Parametros repetidos en la URL** (?hojas=a&hojas=b, como los envia un grupo
  de casillas): `Object.fromEntries(searchParams)` **los colapsa y deja solo el
  ultimo**. Hay que leerlos con `searchParams.getAll(nombre)`.
- **Excel**: el libro se arma en `server/reports/workbook.ts` — encabezado con
  el verde de marca, fila congelada, autofiltro y formato de moneda COP. Las
  fechas y los montos se escriben como Date y number, **no como texto**, o no
  se pueden sumar ni ordenar en Excel. Los nombres de hoja se sanean: Excel no
  abre el archivo si pasan de 31 caracteres o llevan :  / ? * [ ].
- **CSV**: separador `;` y BOM al inicio, para que Excel en espanol lo abra
  bien; numeros con coma decimal, o Excel los lee como texto. Las celdas que
  empiezan por `= + - @` se neutralizan con un apostrofe (inyeccion de
  formulas). Ojo al probar: `Response.text()` **elimina el BOM** al decodificar;
  hay que mirar los bytes con `arrayBuffer()`.
- **PATCH parciales**: `.partial()` de Zod **conserva los `.default()`**; un PATCH con solo las notas reiniciaba estado, tipo, canal, valor estimado, etc. Los esquemas de actualización sobrescriben esos campos sin default con `.extend()` antes de `.partial()` (ver `validators/patch-defaults.test.ts`). Al añadir un campo con default a un esquema de creación, repite el patrón en el de edición.
- **Cotizaciones** (`services/quotes.ts`, reglas puras en `lib/quote-rules.ts` y `lib/quote-discount.ts`): replican el cotizador de Apps Script (Excel `Base_Comercial_Dicampo`) que reemplazan. Propuesta de precio previa al pedido; **no reserva inventario**. El nivel de precio (Distribuidor / Mayorista / Público general / listas de Super distribuidor) es una **`PriceList`** asignada al cliente; `ClientType` sigue siendo el giro del negocio. El servidor calcula con la lista del cliente y congela precios (snapshots). Número `COT-AAAAMMDD-NNN` (`Quote.code`): consecutivo del día en Bogotá, tomado como máximo+1 bajo `lockKey` — el mismo formato que ya recibieron los clientes. Vigencia de **15 días**; pedido mínimo 8 kg; 1 kg = 8 porciones de 125 g (constantes en `quote-rules.ts`).
  - **Descuento** (`discountPolicy`, validado en el servidor): **cliente nuevo = 15 % fijo en su primer pedido, sin excepción** — manda sobre la negociación especial, no se quita ni se combina con otro descuento y ni un ADMIN lo cambia (`policy.fixed`). "Nuevo" = sin pedidos no cancelados; las cotizaciones previas no cuentan, así que puede haber varias con 15 %, pero al convertir se rechaza si el cliente ya tiene un pedido (la promo vale una vez). Después: negociación especial `Client.negotiationFirstPct/NextPct` ("15-10", solo la define un ADMIN) = X % el primer pedido de cada **sede** y Y % después, fija; sin negociación = manual 0 a 8 % (el campo no deja escribir más). Fuera de la promo, un ADMIN puede salirse de los topes. El rótulo (`discountLabel`) lo arma el servidor con los mismos textos del Excel. `discountPercent` se reparte **por línea** antes del IVA. El formulario consulta `GET /api/cotizaciones/descuento`.
  - Estados: BORRADOR → ENVIADA → ACEPTADA/RECHAZADA/VENCIDA; ENVIADA vence sola al pasar `validUntil` (se materializa al consultar). **Aceptar = convertir en pedido** (`/convertir`): el pedido BORRADOR conserva precios y descuentos; no hay aceptación sin pedido. Rechazar exige motivo.
  - `/cotizaciones/:id/imprimir` es la hoja para el cliente (formato del PDF actual, datos de D'CAMPO FRUTAS S.A.S.); se guarda como PDF desde el navegador, sin servicio de PDF. `Client.billingMode` (FACTURA/REMISION) se hereda a la cotización y **no se elige en ella**: solo un ADMIN la cambia, desde la ficha del cliente (`assertCanSetBillingMode` en `services/clients.ts`; quien no es ADMIN crea clientes con FACTURA). Al recalcular un borrador se toma la vigente del cliente.
  - **Sin portar todavía**: el pedido de "Empleados" (tarifa Distribuidor, remisión, sin descuento) y la imagen de facturación interna.
- **Hábitos de compra** (`lib/purchase-profile.ts`): frecuencia, día habitual, sabores top y pedido habitual se **calculan** desde los pedidos, no se capturan: el pedido habitual solo incluye lo pedido en al menos la mitad de los pedidos. El día de la semana es el de Bogotá. La localidad vive en `ClientAddress.locality` (agrupa el despacho; `DeliveryZone` sigue siendo la zona amplia).
- **Cartera y pagos** (`services/receivables.ts`, fechas y antigüedad en `lib/receivables.ts`, `/cartera`): `Payment` es solo-inserción (un error se compensa con otro pago); el saldo de un pedido es total − pagos y `Order.paymentStatus` **se recalcula** con cada pago, nunca se escribe a mano. Cartera = pedidos **ENTREGADOS** con saldo; vence al cumplirse el plazo del pedido (`paymentTerms`: contado, 8, 15 o 30 días) contado desde el **día de entrega en Bogotá**, y el día de vencimiento todavía es plazo. Antigüedad: al día, 1–30, 31–60, más de 60. No se admite pagar de más (candado por pedido). Cobran ventas (en sus pedidos), despacho (al entregar) y ADMIN. Si el saldo del cliente pasa su `creditLimit` se marca, pero hoy **no bloquea** nuevos pedidos.
- **Gestión de hoy** (`services/daily-activity.ts`, tablero): por asesor, llamadas/WhatsApp/visitas/muestras registradas hoy en la bitácora, clientes distintos tocados y lo cobrado, con el día de Bogotá.
- **Compras de fruta por archivo** (`importers/purchases.ts`, rol `COMPRAS` + ADMIN): solo crea; el costo del archivo es el del lote **sin excipientes** y el servidor suma el 5 %. Una compra idéntica (fecha, fruta, proveedor, kilos y costo) se omite, así que subir dos veces el mismo archivo no duplica el gasto. `scripts/datos/compras-iniciales.csv` trae las 11 compras de ejemplo de la app de inventario (5.390 kg, $15.706.950 con excipientes): **son datos de ejemplo; no cargarlas en producción sin confirmar que son reales**.
- **Catálogo de Dicampo** (`scripts/datos/catalogo-dicampo.ts` + `scripts/cargar-catalogo.ts`): datos de la hoja `Config` del Excel comercial y de la app de inventario. Los niveles Distribuidor / Mayorista / Público general son listas de precios; la carga es idempotente y solo completa lo que falta (nunca pisa precios ni productos existentes; informa las diferencias con la "Lista General"). Los **bloques de 500 g** de la app son la presentación LIBRA de Mango, Fresa, Lulo, Mora, Guanábana y Maracuyá. Los **zumos** usan las presentaciones `MEDIO_LITRO`, `LITRO` y `TRES_LITROS` y la categoría `ZUMO`; no suman kilos de pulpa en los paneles (`toKilos` devuelve 0). El SKU de un zumo lleva el volumen (ZNA-1L); si hay que fijar uno a mano, va en `variantCreateSchema.sku`.
- **Materia prima y producción** (basado en la app `inventario_dicampo_v2`; `services/purchases.ts`, `production.ts`, `inventory-panel.ts`, aritmética en `lib/production.ts`):
  - **Compras de fruta** (`/compras`, rol `COMPRAS` + ADMIN, que son quienes ven costos): cada compra es un registro propio (`FruitPurchase`) con fecha, proveedor, kilos y costo; el costo de materia prima suma **5 % de excipientes** (`EXCIPIENT_RATE`) y se fija en el servidor. No mueve el inventario de pulpa.
  - **Tanda de producción** (`/inventario/produccion`, BODEGA + ADMIN): fruta recibida → pulpa pública + granel; el desperdicio **se calcula** (fruta − pulpa), no se digita, y la pulpa no puede pesar más que la fruta. La pulpa pública crea un `Lot` de la variante de 1 kg (código `L-AAAAMMDD-SKU`, con `-2`, `-3` si repite el día) y su `ENTRADA_PRODUCCION`; el granel solo se contabiliza. Vencimiento: se propone 365 días (`DEFAULT_SHELF_LIFE_DAYS`, **supuesto**: ajustar a la vida útil real). La tanda guarda `fruitCost`, una foto del costo de la fruta (compras de los 60 días previos, o la última conocida; nulo si no hay) para que cambiar precios no reescriba el pasado. Quien registra no corrige: las correcciones van por ajuste de inventario.
  - **Muestras y devoluciones** (`/inventario/salidas`): `MUESTRA` baja stock por FEFO sin ser venta. Devolución vendible reingresa a un lote vigente y no bloqueado (`DEVOLUCION`); dañada solo queda en el kardex (`DEVOLUCION_DANADA`) y **no** suma stock. Las devoluciones por cancelación de pedido (`orderId`) no cuentan como devolución de cliente en el panel.
  - **Panel** (`/inventario/panel`, ADMIN): embudo fruta → pulpa → vendido, salidas que no son venta, rentabilidad por producto, días de stock y rendimiento vs esperado (`Product.expectedYieldPct`; "revisar" a 8 puntos o más por debajo). El costo de un kilo de pulpa sale de las tandas (fruta usada × costo de la fruta ÷ pulpa, últimos 120 días) y el de lo vendido es ese valor × kilos vendidos: así dos sabores que comparten fruta (`Product.baseFruit`, p. ej. las limonadas) no se cargan el mismo costo dos veces. Lo que no tiene costo queda fuera de los totales y se avisa. Las libras valen medio kilo.
  - Vendedores consultan existencias en `/inventario` (solo lectura).
- **Metas** (`services/goals.ts`, aritmética en `lib/goals.ts`, `/metas` solo ADMIN, bloque en el tablero): mensuales, en **pesos** y **clientes nuevos**, por asesor y general. `SalesGoal.scopeKey` ("2026-10:id" / "2026-10:GENERAL") es la llave única: un índice sobre `userId` nulo no impediría duplicar la general. Ventas = pedidos vendidos (`SOLD_STATUSES`) del mes por `sellerId`; **cliente nuevo = el que hace su primer pedido vendido en el mes**, atribuido al responsable del cliente (crear un prospecto no cuenta). Los meses se manejan como "AAAA-MM" con límites a medianoche de Bogotá. El ritmo (adelantado / en ritmo / atrasado, ±10 puntos) compara el avance con la fracción transcurrida del mes. Un VENDEDOR ve su fila y la general; bodega y despacho no ven metas.
- **Rutas**: el estado de la ruta arrastra el de sus pedidos, porque describen
  el mismo hecho. Salir a ruta los pasa a DESPACHADO; cada entrega se registra
  por pedido con su evidencia y lo pasa a ENTREGADO; la ruta se cierra sola al
  caer la ultima pendiente. **Cancelar una ruta NO cancela sus pedidos**: los
  devuelve a EN_PREPARACION y los libera, conservando el inventario ya
  reservado, para poder reprogramarlos.
- **Despacho del día** (`/rutas/dia`, `getDispatchDay` en `services/routes.ts`, reglas puras en `lib/dispatch.ts`): pedidos CONFIRMADO a ENTREGADO cuya `requestedDeliveryDate` es ese día (fecha de calendario, medianoche UTC; el "hoy" por defecto es el de Bogotá), agrupados por `ClientAddress.locality` y barrio (sin localidad cae a la zona, y al final "Sin localidad"). Vista "alistamiento": totales por sabor y presentación — kilos y libras no se suman. `Order.collectionNote` / `giftNote` son las observaciones de cobro y obsequios para el repartidor: se editan hasta ENTREGADO por `PATCH /api/pedidos/:id/despacho` (un VENDEDOR solo en sus pedidos). La ruta ofrece Google Maps (máx. 10 paradas, avisa si recorta) y Waze por parada; **no calcula tiempos de ruta** (haría falta la API de Google/Mapbox).
- **Mi ruta** (`/mi-ruta`, `getDriverDay`, `components/routes/driver-stop.tsx`): la pantalla del repartidor (rol DESPACHO, con usuario propio) en el teléfono. Un DESPACHO solo ve y opera las rutas donde es `driverId` (las sin repartidor las puede atender cualquiera de despacho); ADMIN y BODEGA ven todas. Por parada: navegar (Maps/Waze), llamar, **Llegué** (`POST /api/pedidos/:id/llegada`, idempotente: la primera hora manda), **Entregar** y **No entregué**.
  - **Entregar** guarda quién recibió y las observaciones (`DeliveryProof.notes`, texto libre) y, si el repartidor cobró, el pago entra en la **misma transacción** (`recordPayment`, la misma regla de saldo que `/cartera`): o queda entregado y cobrado, o nada. El cobro es opcional (clientes a crédito).
  - **No entregué** (`POST /api/pedidos/:id/no-entrega`): crea un `DeliveryAttempt` con motivo y observaciones, y el pedido vuelve a EN_PREPARACION fuera de la ruta (inventario reservado), igual que al cancelar una ruta. Si era la última parada pendiente, la ruta se cierra.
  - **Tiempos**: `DeliveryRoute.startedAt/completedAt` y `Order.arrivedAt`/`deliveredAt`; `lib/route-timing.ts` separa trayecto (desde que se cerró la parada anterior o desde la salida) de tiempo en sitio. Son marcas del repartidor, no una estimación de Maps: **la ruta sugerida y los minutos previstos siguen siendo de Google Maps, fuera de la app**.
- Solo se montan en ruta pedidos que ya descontaron inventario (CONFIRMADO o
  EN_PREPARACION): despachar sin stock reservado seria prometer mercancia que
  no existe.
- **Contactos y sedes**: se dan de baja, no se borran — las actividades
  referencian contactos y los pedidos referencian sedes (la remisión de una
  entrega pasada necesita su dirección). "Principal" es excluyente y se
  reasigna solo al dar de baja al que lo era. Un cliente **no puede quedarse
  sin sede activa**: sin ella no se le puede despachar.
- **Usuarios**: no se borran, se desactivan (sus pedidos y clientes necesitan
  autor). Tres salvaguardas en `services/users.ts` impiden quedarse sin
  acceso: nadie se desactiva a sí mismo, nadie se quita su propio rol de ADMIN,
  y siempre debe quedar un ADMIN activo. El hash nunca sale del servicio.
- **Agente IA de WhatsApp**: existe como el usuario `agente-ia@dicampo.co` con
  rol `AGENTE_IA` (constantes en `lib/agent.ts`), porque la bitácora y las
  conversaciones necesitan autor. No tiene contraseña ni puede recibirla, no
  cambia de rol y el rol no se ofrece en los formularios: entra solo por
  `/api/agente` con API key. **Desactivarlo apaga la integración**, por eso la
  semilla nunca toca su `active`.
- **API del agente** (`/api/agente/*`): cada handler empieza con
  `requireAgent(request)`, que valida `Authorization: Bearer` contra
  `AGENTE_API_KEY` (o `AGENTE_API_KEY_ANTERIOR` mientras se rota) comparando
  SHA-256 en tiempo constante, y devuelve el usuario `AGENTE_IA` como un
  `SessionUser` para reutilizar los servicios. Llave mala o sin configurar →
  401; agente desactivado → 403. `GET /api/agente/estado` sirve para probar
  la conexión desde n8n. Rotar: llave vieja a `_ANTERIOR`, nueva a
  `AGENTE_API_KEY`, actualizar n8n, vaciar `_ANTERIOR`.
- **Trabajo comercial del agente** (`services/agent.ts`, reglas puras en
  `lib/agent-rules.ts`). Contratos en español porque son las herramientas
  que ve el modelo en n8n:
  - `GET leads?telefono=` → ficha resumida o `null`. Si el número está en
    varios clientes, gana el de actividad más reciente.
  - `POST leads` crea cliente `PROSPECTO` + contacto y lo vincula a la
    conversación. **Idempotente por teléfono** (201 creado / 200 existente),
    con candado `pg_advisory_xact_lock` para los reintentos en paralelo.
    Vendedor por rotación (`pickSeller`: menos prospectos; en empate, el que
    lleva más sin recibir). Sin vendedores activos queda sin asignar y se
    crea una tarea al ADMIN.
  - `PATCH leads/:clientId` completa datos y sede; nunca toca estado,
    vendedor ni NIT.
  - `POST oportunidades` recibe `interes: [{ sku, kilosMes }]` — **el
    interés completo vigente, no un incremento** — y el CRM lo valora con
    `buildPriceResolver()` (kilos → unidades de la variante). Una sola
    oportunidad abierta por cliente: crea en PROSPECTO o revalora (201/200).
    Las notas terminan en un bloque "Interés declarado por WhatsApp" que se
    reemplaza; lo que escriba el vendedor arriba se conserva.
  - `POST oportunidades/:id/etapa` solo a CONTACTADO, MUESTRA_ENVIADA o
    NEGOCIACION y nunca sobre una cerrada. El agente no gana ni pierde.
  - `POST actividades`: resumen tipo WHATSAPP a nombre del agente.
  - `GET visitas/disponibilidad?clientId=&desde=&dias=`: franjas libres del
    asesor que atendería al cliente, **según el horario de ese asesor** (ver
    "Disponibilidad de visitas por asesor"). Devuelve `horario` en palabras,
    `duracionMinutos` y `recibeVisitas`; el prompt del agente toma el
    horario de ahí, no lo tiene escrito. `POST visitas` rechaza (422) lo que
    incumpla ese horario o choque con otra visita pendiente del asesor
    (candado por asesor). Las entregas de pedidos son otra cosa (lunes a
    sábado, 10 a. m. a 5 p. m.). No hay festivos todavía.
  - `POST visitas` (fecha ISO **con zona**): VISITA pendiente en la agenda
    del vendedor, sede principal, oportunidad a CONTACTADO si seguía en
    PROSPECTO (no retrocede) y conversación a HUMANO.
  - `POST escalar`: conversación a HUMANO asignada al vendedor y tarea para
    ya. Si ya estaba en HUMANO solo actualiza el resumen, sin duplicar tarea.
  - **Agenda**: lo que hace el agente va a su nombre; lo que le toca a una
    persona (visita, escalamiento) va a nombre del vendedor, porque la agenda
    de cada uno son sus actividades pendientes. Sin vendedor activo, al
    primer ADMIN activo.
- **Disponibilidad de visitas por asesor** (`/agenda/disponibilidad`,
  `services/visit-schedules.ts`, reglas puras en `lib/visit-schedule.ts`):
  - Cada asesor (VENDEDOR o ADMIN) configura franjas por día, duración de la
    visita, traslado, anticipación mínima en días (0 = desde hoy), horizonte
    y ausencias. Un VENDEDOR solo la suya; ADMIN la de todos.
  - **Sin franjas propias rige el horario general** (`VISIT_RULES`: lunes a
    viernes, 9:00 a. m. a 4:00 p. m., 30 min + 30 de traslado). Borrar todas
    las franjas vuelve a él; para no recibir visitas se apaga
    `acceptsVisits`, y entonces el agente no ofrece ni agenda nada
    (`recibeVisitas: false`).
  - Las franjas se guardan en minutos desde la medianoche de Bogotá con día
    ISO (1 = lunes); `policyFromSchedule` las traduce a la numeración de
    `getDay` que usa el resto del módulo.
  - Las visitas siguen siendo actividades VISITA con `dueAt`; `/agenda` las
    lista por día y se completan con el botón de siempre.
- **Conversaciones desde el agente** (`services/conversations.ts`, reglas
  puras en `lib/conversation-rules.ts`):
  - `POST conversaciones/mensajes`: entrante o saliente, **idempotente por
    `waMessageId`** (201/200; la carrera se resuelve con el índice único).
    Entrante: abre la ventana de 24 h, cancela seguimientos, reabre una
    CERRADA y detecta "DEJAR DE RECIBIR MENSAJES"/"CANCELAR" (baja) y
    "ELIMINAR MIS DATOS" (tarea al ADMIN, 10 días hábiles). Solo cuenta si el
    mensaje es exactamente la instrucción. Saliente del agente: programa el
    seguimiento. Devuelve `palabraClave` para que n8n confirme.
  - Seguimientos a las 24 h, 72 h y 6 días del último mensaje del agente,
    máximo 3. `GET seguimientos/pendientes` exige BOT, `marketingConsentAt`,
    sin baja ni descarte. n8n registra cada envío con `seguimiento: true`.
  - `GET conversaciones/estado`: quién responde, consentimientos, descarte,
    último entrante (para agrupar mensajes seguidos) y ventana de 24 h.
  - `GET conversaciones/contexto?telefono=&limite=`: estado + ficha del lead
    + últimos mensajes en orden y `pendientes`, los entrantes que siguen al
    último mensaje nuestro (el bloque que se responde de una vez). Es la
    llamada que hace n8n antes del modelo.
  - `POST conversaciones/consentimiento` (AVISO / COMERCIAL / BAJA) deja nota
    en la ficha si ya es cliente. `POST conversaciones/descartar` cierra sin
    crear cliente. `POST conversaciones/entregas`: el estado solo avanza.
  - **Multimedia**: nunca pasa por Netlify (6 MB por petición). `POST
    conversaciones/media` firma una subida directa al bucket privado
    `wa-media` (`{telefono}/{AAAA-MM}/{wamid}.{ext}`), n8n hace `PUT` y luego
    registra el mensaje con `media.ruta`, que debe estar en la carpeta de ese
    teléfono. `server/storage.ts` habla REST con Storage y necesita
    `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (sin ellas, 503).
  - Ojo: dentro de una transacción no se consulta con el `prisma` global (lo
    que haga falta, como el cliente del número, se resuelve antes); pediría
    una segunda conexión mientras la primera espera.
- **Supervisión de conversaciones** (`/conversaciones`, `services/supervision.ts`,
  API interna `/api/conversaciones/*` con sesión, roles de ventas):
  - ADMIN ve todas; un VENDEDOR, las de su cartera **y** las que tiene
    asignadas (un escalamiento puede llegar antes de que el número sea
    cliente). Fuera de alcance → 404, no 403.
  - **Tomar** pasa a HUMANO y asigna; un vendedor no le quita una
    conversación a otro, un ADMIN sí. **Liberar** (devolver al agente) solo
    quien la atiende o un ADMIN.
  - **Responder** exige haberla tomado y la ventana de 24 h abierta (fuera de
    ella Meta solo acepta plantillas). El CRM no habla con Meta: llama al
    webhook de n8n (`server/n8n.ts`, `N8N_ENVIO_WEBHOOK_URL` +
    encabezado `X-CRM-Secret` = `N8N_ENVIO_SECRET`), que devuelve
    `{ waMessageId }`. Si el mismo wamid ya está en esa conversación (n8n lo
    registró por la API del agente) no se duplica.
  - La multimedia se ve con URLs firmadas de 1 h. El chat **no** se recarga a
    ciegas: `AutoRefresh` consulta `/api/conversaciones/:id/version` y solo
    refresca si cambió, porque re-renderizar re-firma los archivos y corta un
    audio a medias. La bandeja se refresca cada 30 s.
  - Horas del chat con `formatBogotaDateTime` / `formatBogotaTime`
    (`lib/format.ts`): Netlify corre en UTC y `formatDateTime` (date-fns) usa
    la zona del servidor.
  - La traza del agente se muestra si `agentTrace` trae
    `{ herramientas: string[], fuentes: [{ titulo, similitud }] }`; otra forma
    se muestra como JSON.
- **Base de conocimiento del agente** (`supabase/kb/001_kb_busqueda.sql`,
  aplicado en Supabase como migración `daic12_kb_busqueda`): vive en el
  esquema **`kb`**, fuera de `public`, porque Prisma gestiona `public` y una
  migración propondría borrar cualquier tabla que no esté en
  `schema.prisma`. **No la agregues al esquema de Prisma** ni la muevas a
  `public`. pgvector y unaccent están en el esquema `extensions`.
  - n8n la usa solo por RPC con la llave de servicio: `buscar_kb` (búsqueda
    híbrida semántica + palabras clave sin tildes, fusionadas con RRF),
    `kb_hash_actual` y `kb_guardar_fragmento` (ingesta: si el hash no
    cambió no se vuelve a pedir el embedding) y `kb_desactivar_sobrantes`.
    `anon` y `authenticated` no tienen acceso.
  - Cambios al SQL: archivo nuevo en `supabase/kb/` y aplicarlo con el SQL
    editor o `apply_migration`; nunca con `prisma migrate`.
  - El agente consulta por `POST /api/agente/conocimiento/buscar`
    (`services/knowledge.ts`): el CRM pide el embedding a OpenAI
    (`OPENAI_API_KEY`, `text-embedding-3-small`, el mismo de la ingesta) y
    llama a `buscar_kb` con `$queryRaw`. Sin llave → 503. La ingesta sigue en
    n8n.
- **Workflow de n8n del agente** (`n8n/`): `dicampo-agente-whatsapp.json` se genera con
  `python3 n8n/build.py` desde `system-prompt.md` y `n8n/js/`; no se edita a mano. Ver
  `n8n/README.md` (instalación, credenciales y prueba de punta a punta en `n8n/pruebas/`).
  Si se agregan sabores, actualizar la tabla de SKU del prompt.
- **WhatsApp por contacto**: `Contact.whatsappE164` es el número normalizado
  con `contactWhatsappKey()` (WhatsApp o, si falta, teléfono). Lo mantiene
  `services/clients.ts` al crear y editar; es la llave con que el agente
  encuentra al cliente, así que nada debe escribir `whatsapp` o `phone` sin
  pasar por el servicio.
- **Conversaciones** (`WhatsappConversation`, `WhatsappMessage`): un número =
  una conversación. `waMessageId` es único para absorber los reintentos del
  webhook de Meta. Un lead descartado (fuera de cobertura o sin negocio) queda
  solo como conversación, sin crear cliente. Los seguimientos exigen
  `marketingConsentAt` y respetan `optOutAt`: es lo que pide la política de
  datos de Dicampo.
- **Etapas del pipeline**: los nombres en pantalla son los del embudo comercial (Sin cita · Cita programada · Visita / capacitación realizada · Pendiente / seguimiento · Cliente cerrado · Cliente perdido) pero los valores del enum son los de siempre (PROSPECTO, CONTACTADO, MUESTRA_ENVIADA, NEGOCIACION, GANADA, PERDIDA): la API del agente y los datos dependen de ellos. Cambia el texto solo en `OPPORTUNITY_STAGE_LABEL`. El agente crea la oportunidad en PROSPECTO; "Cita programada" la fija `POST visitas`. Tras editar `n8n/system-prompt.md` hay que regenerar el JSON con `python3 n8n/build.py`.
- **Pipeline**: a diferencia de los pedidos, NO es una máquina de estados
  rígida — en ventas se retrocede de etapa con normalidad. Las únicas reglas
  están en `src/lib/pipeline-stages.ts`: perder exige motivo, cerrar estampa
  `closedAt`, reabrir lo limpia, y ganar activa al cliente si era PROSPECTO.
- **Ajustes de inventario**: la interfaz pide la cantidad **en positivo** y el
  signo lo pone el tipo de operación — en bodega se piensa "se dañaron 5", no
  "menos cinco". Solo se ofrecen AJUSTE y MERMA: las salidas por venta y las
  devoluciones las genera el flujo de pedidos, y tecleadas a mano
  descuadrarían el kardex contra los pedidos.
- **Lotes vencidos**: `expireOverdueLots` los pasa a VENCIDO y así salen de la
  rotación FEFO (`lockAvailableLots` filtra por DISPONIBLE). Hoy se dispara a
  mano desde bodega; debería ser una tarea diaria.
- **Inventario FEFO**: al confirmar un pedido se asignan lotes por
  `expiryDate` ascendente, **dentro de una transacción** que descuenta
  `Lot.quantityAvailable` y escribe el `StockMovement`. `Order.stockAppliedAt`
  hace la operación idempotente.

## Carga masiva

Nueve entidades se pueden subir por archivo desde `/importar` (y desde el botón
"Importar" de cada módulo): clientes, contactos, sedes, productos, precios,
lotes, compras de fruta, oportunidades y **pedidos históricos**.

- **Pedidos históricos** (`importers/orders.ts`, solo ADMIN): ventas que ya
  ocurrieron. Una fila por renglón; las filas con el mismo número de pedido
  (`Order.externalRef`, único) forman un pedido, aunque no estén seguidas.
  Entran ENTREGADOS con su vendedor (o el responsable del cliente; se admite
  un vendedor ya inactivo), el precio del archivo (o la lista del cliente) y
  **no descuentan inventario**. "Pagado" vacío = pagado completo; "No" o un
  abono los deja en cartera (el pago pasa por `recordPayment`). Un número ya
  cargado se omite. Las fechas se guardan al mediodía de Bogotá. Pedidos por
  despachar no se importan: van por el formulario, con FEFO.
- **Por lotes**: una entidad con `batch` en `lib/import/entities.ts` se envía
  desde el navegador en varias peticiones seguidas (`planBatches` en
  `lib/import/batches.ts`: una unidad nunca se parte entre lotes; `lines`
  lleva el número real de cada fila) y los informes se juntan con
  `mergeReports`. Así una carga pesada no rebasa el tiempo de una función de
  Netlify. El servidor la procesa con `runGroupedImport`: un resultado por
  unidad.
- **No depende de una plantilla.** El archivo se lee, se proponen las columnas
  y la persona corrige el cotejo. La sugerencia sale de los **alias** de cada
  campo en `lib/import/entities.ts`; si un encabezado real no se reconoce, el
  arreglo es añadirlo ahí, no pedirle a nadie que renombre su Excel.
- **La simulación y la ejecución real recorren el mismo código**; solo cambia
  `dryRun`. Una vista previa calculada aparte acabaría prometiendo algo
  distinto de lo que luego ocurre.
- **Una fila mala no tumba el archivo**: cada fila se procesa y se reporta
  aparte. Nada de envolverlo todo en una transacción — obligaría a corregir dos
  mil filas por una celda con una fecha rara.
- **Los importadores llaman a los servicios**, nunca a Prisma para escribir.
  Así la carga respeta las mismas reglas que el formulario (cartera del
  vendedor, NIT único, sede principal excluyente, kardex del lote). El precio
  de eso son varias consultas por fila; a 2.000 filas como máximo, sale a
  cuenta.
- **Permisos por módulo**: cada carga exige los roles de su módulo. Catálogo y
  precios, solo ADMIN; lotes, bodega; cartera y pipeline, ventas. `ImportLink`
  comprueba el mismo permiso que la pantalla, así que no aparece un botón que
  acabe en una redirección.
- **.xls no se lee** (ExcelJS solo abre .xlsx) y se dice con todas las letras
  al detectar la firma OLE2, en vez de fallar con "archivo dañado". Sí se leen
  .xlsx, .csv, .tsv y .txt.
- **Codificación**: se intenta UTF-8 y, si aparecen caracteres de reemplazo, se
  reintenta con Windows-1252 — los CSV de sistemas viejos vienen en ANSI.
- El tope de 2.000 filas (`validators/imports.ts`) no es del negocio: el
  archivo viaja al navegador para cotejar y vuelve para ejecutarse.
- Los lotes **solo se crean**. Un lote existente no se reescribe: su saldo es
  el resultado del kardex, y cambiarlo por archivo descuadraría la auditoría.

## Estado actual

Verificado contra la base real de Supabase (PostgreSQL 17.6), además de
`typecheck`, `lint`, `build` y 95 pruebas unitarias:

- Migración inicial aplicada y semilla cargada (17 sabores, 23 variantes con
  precio, 6 zonas de Bogotá, usuario admin).
- Flujo end-to-end comprobado: alta de cliente con contacto y sede → registro
  de lotes → pedido → confirmación con reparto **FEFO** → cancelación con
  devolución de inventario. Incluye los casos que deben fallar: transición
  inválida y stock insuficiente (con reversión completa de la transacción).
- Pipeline verificado end-to-end: avance por el embudo, cierre con motivo,
  reapertura que limpia el cierre, activación automática del cliente al ganar
  y aislamiento por vendedor.
- Login por credenciales, propagación del rol en la sesión y todas las
  pantallas respondiendo 200 con sesión iniciada.

### Módulos

| Módulo | Estado |
|---|---|
| Infraestructura, auth, roles | Listo |
| Clientes | Listo |
| Catálogo y precios (editable) | Listo |
| Pedidos | Listo |
| Inventario FEFO (editable) | Listo |
| Pipeline y actividades | Listo |
| Usuarios y perfil | Listo |
| Rutas de despacho | Listo |
| Disponibilidad de visitas por asesor | Listo |
| Cotizaciones, despacho por localidad, metas, materia prima y producción, cartera | Listo (migraciones hasta `20261022160000_cartera_pagos` aplicadas en Supabase el 22/10/2026; `20261022170000_zumos_presentaciones` también aplicada) |
| Reportes | Listo |
| Carga masiva (CSV / XLSX) | Listo |

Todos los módulos listos tienen interfaz completa de lectura y escritura.

De la carga masiva están verificados el lector y el cotejo (CSV con separador
detectado, comillas y BOM; XLSX con hoja de portada, título suelto, números y
fechas; rechazo del .xls binario; y cotejo correcto de las siete entidades
sobre encabezados verosímiles).

La ejecución también está verificada. `scripts/verificar-carga-masiva.ts` sube
un CSV por cada una de las siete entidades contra la base de `DATABASE_URL`,
con el cotejo que propone el propio módulo: simula, ejecuta, comprueba lo que
quedó en la base y borra lo que creó (todo lleva la marca `ZZVERIF`). Pasa
completo contra Postgres local. En producción se simularon las siete y se
escribieron de verdad productos y precios: así entraron los precios del
brochure 2026 y los sabores Uva, Piña y Piña Colada.

**Sobre archivos adjuntos:** se descartó Cloudflare R2. Las imágenes de
producto no aportan en un CRM interno —el vendedor conoce el catálogo— y la
foto de la remisión firmada no justifica otro servicio: la evidencia actual
(quién recibió y su documento) ya es defendible ante un reclamo. Si se añade,
será con **Supabase Storage**, que ya está aprovisionado y cuyo plan gratuito
sobra para el volumen real. Los campos `Product.imageKey` y
`DeliveryProof.photoKey` quedan reservados en el esquema, sin uso.
