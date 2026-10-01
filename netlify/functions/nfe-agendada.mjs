// Função agendada da Netlify: a cada 2 horas pede ao site para buscar as notas
// fiscais novas na SEFAZ. A própria rotina respeita a espera de 1h exigida pela
// SEFAZ quando não há documento novo.
export default async () => {
  const base = process.env.URL;
  const segredo = process.env.CRON_SECRET;
  if (!base || !segredo) {
    console.log('nfe-agendada: URL ou CRON_SECRET ausente');
    return;
  }
  const res = await fetch(`${base}/api/cartao/nfe/sincronizar`, {
    method: 'POST',
    headers: { authorization: `Bearer ${segredo}` },
  });
  console.log('nfe-agendada:', res.status, (await res.text()).slice(0, 300));
};

export const config = { schedule: '0 */2 * * *' };
