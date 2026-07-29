interface EnviarEmailPedidoParams {
  pedidoId: string;
  clienteNome: string;
  representanteNome: string;
  representanteEmail: string;
  total: number;
  excelBuffer: Buffer;
  excelFileName: string;
}

export async function enviarEmailPedido({
  pedidoId,
  clienteNome,
  representanteNome,
  representanteEmail,
  total,
  excelBuffer,
  excelFileName,
}: EnviarEmailPedidoParams): Promise<boolean> {
  const to = process.env.EMAIL_COMERCIAL_PARA;
  const from = process.env.EMAIL_FROM ?? 'pedidos@natuhair.com.br';

  if (!to) {
    console.error('EMAIL_COMERCIAL_PARA não configurado — pulando envio de e-mail.');
    return false;
  }

  const totalFormatado = total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const subject = `Novo pedido #${pedidoId.slice(0, 8)} — ${clienteNome}`;
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; color: #121c2a;">
      <h2 style="color: #7c3aed;">Novo pedido recebido</h2>
      <p><strong>Pedido:</strong> ${pedidoId}</p>
      <p><strong>Cliente:</strong> ${clienteNome}</p>
      <p><strong>Representante:</strong> ${representanteNome} (${representanteEmail})</p>
      <p><strong>Total:</strong> ${totalFormatado}</p>
      <p>O detalhamento completo está no Excel em anexo.</p>
    </div>
  `;

  try {
    if (process.env.RESEND_API_KEY) {
      const { Resend } = await import('resend');
      const resend = new Resend(process.env.RESEND_API_KEY);
      const { error } = await resend.emails.send({
        from,
        to,
        subject,
        html,
        attachments: [
          {
            filename: excelFileName,
            content: excelBuffer.toString('base64'),
          },
        ],
      });
      if (error) {
        console.error('Falha ao enviar e-mail via Resend:', error);
        return false;
      }
      return true;
    }

    const { default: nodemailer } = await import('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });

    await transporter.sendMail({
      from,
      to,
      subject,
      html,
      attachments: [{ filename: excelFileName, content: excelBuffer }],
    });
    return true;
  } catch (err) {
    console.error('Falha ao enviar e-mail do pedido:', err);
    return false;
  }
}
