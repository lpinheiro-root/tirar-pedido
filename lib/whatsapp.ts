interface EnviarWhatsappConfirmacaoParams {
  telefone: string;
  representanteNome: string;
  clienteNome: string;
  pedidoId: string;
  total: number;
}

function normalizarTelefone(telefone: string): string {
  const digits = telefone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

/**
 * Envia a confirmação via WhatsApp Business Cloud API (Meta).
 * Requer um template aprovado chamado "pedido_confirmado" com 3 variáveis
 * de corpo: {{1}} nome do representante, {{2}} cliente, {{3}} total.
 * Se as credenciais não estiverem configuradas, apenas registra e retorna false.
 */
export async function enviarWhatsappConfirmacao({
  telefone,
  representanteNome,
  clienteNome,
  pedidoId,
  total,
}: EnviarWhatsappConfirmacaoParams): Promise<boolean> {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION ?? 'v20.0';

  if (!token || !phoneNumberId) {
    console.error('WHATSAPP_TOKEN/WHATSAPP_PHONE_NUMBER_ID não configurados — pulando WhatsApp.');
    return false;
  }

  const totalFormatado = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  try {
    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: normalizarTelefone(telefone),
          type: 'template',
          template: {
            name: 'pedido_confirmado',
            language: { code: 'pt_BR' },
            components: [
              {
                type: 'body',
                parameters: [
                  { type: 'text', text: representanteNome },
                  { type: 'text', text: clienteNome },
                  { type: 'text', text: totalFormatado },
                  { type: 'text', text: pedidoId.slice(0, 8) },
                ],
              },
            ],
          },
        }),
      }
    );

    if (!response.ok) {
      console.error('Falha ao enviar WhatsApp:', await response.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error('Falha ao enviar WhatsApp do pedido:', err);
    return false;
  }
}
