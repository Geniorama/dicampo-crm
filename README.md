# CRM Dicampo

Sistema de gestión comercial para **Dicampo**, fabricante de pulpa de fruta
congelada 100% natural con distribución B2B en Bogotá.

Cubre el ciclo completo de la operación: prospecto → cliente → pedido →
despacho → entrega, con control de inventario por lote y fecha de vencimiento.

## Stack

| Capa | Tecnología |
|---|---|
| Aplicación | Next.js 15 (App Router) · React 19 · TypeScript |
| Estilos | Tailwind CSS v4 |
| Base de datos | PostgreSQL (Supabase) · Prisma 7 |
| Autenticación | Auth.js v5 (credenciales + roles) |
| Despliegue | Netlify, detrás de Cloudflare |

## Puesta en marcha

### 1. Requisitos

- Node.js 20.19 o superior (Prisma 7 lo exige; se recomienda 22)
- Un proyecto de Supabase

### 2. Variables de entorno

```bash
cp .env.example .env
```

Rellena el archivo `.env`:

- **`DATABASE_URL`** — en Supabase, *Project Settings → Database → Connection
  string → Transaction pooler* (puerto **6543**). Añade
  `?pgbouncer=true&connection_limit=1`.
- **`DIRECT_URL`** — la misma cadena pero por el puerto **5432** (conexión
  directa). Solo la usa el CLI de Prisma; las migraciones no funcionan a
  través del pooler.
- **`AUTH_SECRET`** — genérala con `npx auth secret`.
- **`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`** — credenciales del primer
  usuario administrador.

### 3. Base de datos

```bash
npm install
npm run db:migrate    # crea las tablas
npm run db:seed       # sabores, zonas, lista de precios y usuario admin
```

### 4. Desarrollo

```bash
npm run dev
```

Abre http://localhost:3000 e ingresa con las credenciales del seed.

## Comandos

```bash
npm run dev / build / start
npm run typecheck        # tsc --noEmit
npm run lint
npm run test             # vitest

npm run db:migrate       # nueva migración (desarrollo)
npm run db:deploy        # aplicar migraciones (producción)
npm run db:seed
npm run db:studio        # explorador de datos
npm run db:reset         # ⚠️ borra y vuelve a sembrar
```

## Roles

| Rol | Alcance |
|---|---|
| `ADMIN` | Acceso total, gestión de usuarios y reasignación de cartera |
| `VENDEDOR` | Solo los clientes, oportunidades y pedidos de su cartera |
| `BODEGA` | Inventario, lotes y preparación de pedidos |
| `DESPACHO` | Rutas de reparto y registro de entregas |

## Despliegue

**Netlify** toma la configuración de `netlify.toml`. Carga en el panel las
mismas variables de `.env` (`DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`,
`AUTH_TRUST_HOST=true`). El build aplica las migraciones pendientes
antes de compilar.

**Cloudflare** actúa como proxy DNS: usa SSL en modo **Full (strict)** y
mantén `/api/*` sin caché (ya viene declarado en `netlify.toml`).

## Documentación

`CLAUDE.md` contiene las convenciones de código y los detalles del stack que
conviene conocer antes de tocar el repositorio.
