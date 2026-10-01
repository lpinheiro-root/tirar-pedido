// Função agendada da Netlify: a cada 2 horas busca as notas fiscais novas na
// SEFAZ (só age se o certificado A1 foi configurado). A rotina respeita a espera
// de 1h exigida pela SEFAZ quando não há documento novo.
export default async () => {
  const base = process.env.URL;
  const segredo = process.env.CRON_SECRET;
  if (!base || !segredo) {
    console.log('nfe-agendada: URL ou CRON_SECRET ausente');
    return;
  }
  const res = await fetch(`${base}/api/cartao/cron?tarefa=nfe`, {
    method: 'POST',
    headers: { authorization: `Bearer ${segredo}` },
  });
  console.log('nfe-agendada:', res.status, (await res.text()).slice(0, 300));
};

export const config = { schedule: '45 */2 * * *' };
