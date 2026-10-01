// Função agendada da Netlify: a cada hora puxa as compras de todas as contas
// do Mercado Livre conectadas, concilia as faturas pendentes e vincula as
// notas fiscais já recebidas.
export default async () => {
  const base = process.env.URL;
  const segredo = process.env.CRON_SECRET;
  if (!base || !segredo) {
    console.log('ml-agendada: URL ou CRON_SECRET ausente');
    return;
  }
  const res = await fetch(`${base}/api/cartao/cron?tarefa=ml`, {
    method: 'POST',
    headers: { authorization: `Bearer ${segredo}` },
  });
  console.log('ml-agendada:', res.status, (await res.text()).slice(0, 300));
};

export const config = { schedule: '15 * * * *' };
