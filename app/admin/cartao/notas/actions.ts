'use server';

import { revalidatePath } from 'next/cache';
import { requireSuperAdmin } from '@/lib/auth';
import { executarSincronizacaoNFe, salvarCertificadoNFe } from '@/lib/cartao/nfe';
import { UF_IBGE } from '@/lib/cartao/sefaz';

export interface NotasFormState {
  erro?: string;
  mensagem?: string;
}

export async function salvarCertificado(
  _prev: NotasFormState | undefined,
  formData: FormData
): Promise<NotasFormState> {
  await requireSuperAdmin();
  const arquivo = formData.get('arquivo');
  const senha = String(formData.get('senha') ?? '');
  const uf = String(formData.get('uf') ?? '').toUpperCase();
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: 'Selecione o arquivo do certificado (.pfx ou .p12).' };
  if (!senha) return { erro: 'Informe a senha do certificado.' };
  if (!UF_IBGE[uf]) return { erro: 'Selecione a UF da empresa.' };

  try {
    const cert = await salvarCertificadoNFe(Buffer.from(await arquivo.arrayBuffer()), senha, uf);
    revalidatePath('/admin/cartao/notas');
    return {
      mensagem: `Certificado de ${cert.titular} (CNPJ ${cert.cnpj}) salvo, válido até ${cert.validoAte.toLocaleDateString('pt-BR')}.`,
    };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}

export async function buscarNotasAgora(): Promise<NotasFormState> {
  await requireSuperAdmin();
  try {
    const r = await executarSincronizacaoNFe();
    revalidatePath('/admin/cartao', 'layout');
    return r.ok ? { mensagem: r.mensagem } : { erro: r.mensagem };
  } catch (e) {
    return { erro: (e as Error).message };
  }
}
