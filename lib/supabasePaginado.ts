/**
 * O Supabase devolve no máximo 1.000 linhas por consulta (max-rows), mesmo com
 * .limit() maior — somas e exportações ficavam incompletas. Esta função busca
 * página por página até acabar.
 *
 * `consulta(de, ate)` deve montar a consulta já com filtros e ordenação estável
 * e aplicar `.range(de, ate)`.
 */
const PAGINA = 1000;

export async function buscarTodas<T>(
  consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  maximo = 50_000
): Promise<T[]> {
  const todas: T[] = [];
  for (let de = 0; de < maximo; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    todas.push(...(data ?? []));
    if (!data || data.length < PAGINA) break;
  }
  return todas;
}
