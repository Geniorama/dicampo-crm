import { vec } from "./embeddings-mock.mjs";
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const frags = [
  ["faq", "Pedidos y logística", "¿Cuál es el pedido mínimo? El pedido mínimo es de 8 paquetes (8 kilos). Puedes combinar sabores."],
  ["faq", "Pedidos y logística", "¿El domicilio tiene costo? No, el domicilio es gratis en toda Bogotá y en Mosquera, Funza y Madrid."],
  ["producto", "Presentaciones", "Un paquete es 1 kilo dividido en 8 porciones de 125 gramos. Cada porción da un jugo de 14 a 16 onzas."],
  ["politica", "Pagos", "Se paga contra entrega. Clientes recurrentes: pago quincenal o mensual."],
];
let i = 0;
for (const [cat, sec, txt] of frags) {
  await c.query("select public.kb_guardar_fragmento($1,$2,$3,$4,$5,$6::float4[]::extensions.vector,$7,$8,$9)",
    ["entrenamiento", i++, "Entrenamiento Agente IA", txt, "h" + i, vec(sec + " " + txt), "Entrenamiento", sec, cat]);
}
console.log((await c.query("select count(*) from kb.fragmentos")).rows[0]);
await c.end();
