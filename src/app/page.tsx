import { redirect } from "next/navigation";

/** La raíz no tiene contenido propio: el CRM arranca en el tablero. */
export default function RootPage() {
  redirect("/dashboard");
}
