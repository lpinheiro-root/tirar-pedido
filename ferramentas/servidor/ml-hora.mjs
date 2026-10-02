// Sincronização automática das compras do Mercado Livre (a cada hora, via PM2).
// Chama a rotina do Natuhair Finanças que roda neste mesmo servidor.
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(new URL("../natuhair-financas/.env.local", import.meta.url), "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const r = await fetch("http://localhost:3001/api/cartao/cron?tarefa=ml", { method: "POST", headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
console.log(new Date().toISOString(), "ml:", r.status, (await r.text()).slice(0, 300));
