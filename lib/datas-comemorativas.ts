/* Datas comemorativas do varejo de moda — fonte única.
   Usado pelo Gerente (contexto) e pela tela de Campanhas (cards proativos:
   "a data tá chegando, bora montar a campanha antes que passe"). */

export type DataComemorativa = { nome: string; mesDia: [number, number]; aprox?: boolean }

export const DATAS_COMEMORATIVAS: DataComemorativa[] = [
  { nome: 'Dia das Mães', mesDia: [5, 11], aprox: true },
  { nome: 'Dia dos Namorados', mesDia: [6, 12] },
  { nome: 'Dia dos Pais', mesDia: [8, 10], aprox: true },
  { nome: 'Dia das Crianças', mesDia: [10, 12] },
  { nome: 'Black Friday', mesDia: [11, 28], aprox: true },
  { nome: 'Natal', mesDia: [12, 25] },
  { nome: 'Ano Novo', mesDia: [1, 1] },
]

export type DataProxima = { nome: string; dias: number; data: string; aprox?: boolean }

/* Próximas datas dentro de `dentroDeDias` (default 60), ordenadas pela mais perto. */
export function proximasDatas(dentroDeDias = 60, hoje = new Date()): DataProxima[] {
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return DATAS_COMEMORATIVAS
    .map(d => {
      let alvo = new Date(hoje.getFullYear(), d.mesDia[0] - 1, d.mesDia[1])
      if (alvo < inicioHoje) alvo = new Date(hoje.getFullYear() + 1, d.mesDia[0] - 1, d.mesDia[1])
      const dias = Math.round((alvo.getTime() - inicioHoje.getTime()) / 86400000)
      return {
        nome: d.nome,
        dias,
        data: `${String(d.mesDia[1]).padStart(2, '0')}/${String(d.mesDia[0]).padStart(2, '0')}`,
        aprox: d.aprox,
      }
    })
    .filter(d => d.dias <= dentroDeDias)
    .sort((a, b) => a.dias - b.dias)
}
