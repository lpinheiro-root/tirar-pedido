import ExcelJS from 'exceljs';
import type { CartItem } from '@/types';

interface GerarExcelPedidoParams {
  pedidoId: string;
  clienteNome: string;
  representanteNome: string;
  criadoEm: Date;
  itens: CartItem[];
}

export async function gerarExcelPedido({
  pedidoId,
  clienteNome,
  representanteNome,
  criadoEm,
  itens,
}: GerarExcelPedidoParams): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Natuhair Pedidos';
  workbook.created = criadoEm;

  const sheet = workbook.addWorksheet('Pedido');

  sheet.mergeCells('A1:E1');
  sheet.getCell('A1').value = 'Natuhair Pedidos — Pedido de Venda';
  sheet.getCell('A1').font = { size: 16, bold: true, color: { argb: 'FF7C3AED' } };

  sheet.getCell('A3').value = 'Pedido';
  sheet.getCell('B3').value = pedidoId;
  sheet.getCell('A4').value = 'Cliente';
  sheet.getCell('B4').value = clienteNome;
  sheet.getCell('A5').value = 'Representante';
  sheet.getCell('B5').value = representanteNome;
  sheet.getCell('A6').value = 'Data';
  sheet.getCell('B6').value = criadoEm.toLocaleString('pt-BR');
  for (let row = 3; row <= 6; row++) {
    sheet.getCell(`A${row}`).font = { bold: true };
  }

  const headerRow = sheet.getRow(8);
  headerRow.values = ['Código', 'Produto', 'Quantidade', 'Preço Unitário', 'Subtotal'];
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });

  let rowIndex = 9;
  let total = 0;
  for (const item of itens) {
    const subtotal = item.preco * item.quantidade;
    total += subtotal;
    const row = sheet.getRow(rowIndex);
    row.values = [item.codigo, item.nome, item.quantidade, item.preco, subtotal];
    row.getCell(4).numFmt = '"R$" #,##0.00';
    row.getCell(5).numFmt = '"R$" #,##0.00';
    rowIndex++;
  }

  const totalRow = sheet.getRow(rowIndex + 1);
  totalRow.getCell(4).value = 'Total';
  totalRow.getCell(4).font = { bold: true };
  totalRow.getCell(5).value = total;
  totalRow.getCell(5).numFmt = '"R$" #,##0.00';
  totalRow.getCell(5).font = { bold: true };

  sheet.columns = [
    { width: 14 },
    { width: 42 },
    { width: 12 },
    { width: 16 },
    { width: 16 },
  ];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
