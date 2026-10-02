// ── SQL Server (produtos e clientes) ───────────────────────────

export interface Cliente {
  id: string;
  nome: string;
  cidade: string;
  estado: string;
  codigoRepresentante: string;
  tabelaPreco: string | null;
  telefone?: string | null;
  email?: string | null;
}

export interface GrupoProduto {
  id: string;
  nome: string;
  imagemUrl?: string | null;
  totalProdutos: number;
}

export interface Produto {
  id: string;
  codigo: string;
  nome: string;
  grupoId: string;
  grupoNome?: string;
  preco: number;
  imagemUrl?: string | null;
  estoque: number;
  ativo: boolean;
  destaque?: string | null;
}

// ── Supabase (representantes e pedidos) ────────────────────────

export type Role = 'representante' | 'admin';

export interface Representante {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  estado: string;
  codigo_representante_sql: string;
  role: Role;
  ativo: boolean;
  /** Natuhair Cartão: vê os dados de todos e gerencia usuários */
  super_admin?: boolean;
  /** pode ver e preencher o controle de devoluções (NF-e Recebidas) */
  acesso_devolucoes?: boolean;
  criado_em: string;
}

export type StatusPedido = 'enviado' | 'processando' | 'faturado' | 'cancelado';

export interface Pedido {
  id: string;
  representante_id: string;
  cliente_id_sql: string;
  cliente_nome: string;
  status: StatusPedido;
  excel_url: string | null;
  enviado_email: boolean;
  enviado_whatsapp: boolean;
  criado_em: string;
}

export interface PedidoItem {
  id: string;
  pedido_id: string;
  produto_id_sql: string;
  produto_nome: string;
  produto_imagem_url: string | null;
  quantidade: number;
  preco_unitario: number;
  subtotal: number;
}

export interface PedidoComItens extends Pedido {
  itens: PedidoItem[];
  representante?: Pick<Representante, 'id' | 'nome' | 'email'>;
}

export interface CartItem {
  produtoId: string;
  codigo: string;
  nome: string;
  imagemUrl?: string | null;
  preco: number;
  quantidade: number;
}

export interface NovoPedidoPayload {
  clienteIdSql: string;
  clienteNome: string;
  itens: CartItem[];
}
