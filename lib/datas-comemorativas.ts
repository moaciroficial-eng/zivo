/* Datas comemorativas do varejo de moda — fonte única, com datas CORRETAS.
   Feriados móveis (Dia das Mães/Pais = domingos; Black Friday = última sexta)
   são calculados por ano, não chumbados. Usado pelo Gerente e pela tela de
   Campanhas (cards proativos + a consultora agenda os posts pela data real). */

type Regra =
  | { tipo: 'fixo'; mes: number; dia: number }
  | { tipo: 'nth'; mes: number; weekday: number; n: number }   // n-ésimo weekday (0=Dom)
  | { tipo: 'ultimo'; mes: number; weekday: number }           // último weekday do mês

export type DataComemorativa = { nome: string; regra: Regra }

export const DATAS_COMEMORATIVAS: DataComemorativa[] = [
  { nome: 'Dia das Mães',       regra: { tipo: 'nth', mes: 5, weekday: 0, n: 2 } },  // 2º domingo de maio
  { nome: 'Dia dos Namorados',  regra: { tipo: 'fixo', mes: 6, dia: 12 } },
  { nome: 'Dia dos Pais',       regra: { tipo: 'nth', mes: 8, weekday: 0, n: 2 } },  // 2º domingo de agosto
  { nome: 'Dia das Crianças',   regra: { tipo: 'fixo', mes: 10, dia: 12 } },
  { nome: 'Black Friday',       regra: { tipo: 'ultimo', mes: 11, weekday: 5 } },    // última sexta de novembro
  { nome: 'Natal',              regra: { tipo: 'fixo', mes: 12, dia: 25 } },
  { nome: 'Ano Novo',           regra: { tipo: 'fixo', mes: 1, dia: 1 } },
]

function dataDoAno(regra: Regra, year: number): Date {
  if (regra.tipo === 'fixo') return new Date(year, regra.mes - 1, regra.dia)
  if (regra.tipo === 'nth') {
    const primeiro = new Date(year, regra.mes - 1, 1)
    const offset = (regra.weekday - primeiro.getDay() + 7) % 7
    return new Date(year, regra.mes - 1, 1 + offset + (regra.n - 1) * 7)
  }
  // último weekday do mês
  const ultimoDia = new Date(year, regra.mes, 0) // dia 0 do mês seguinte = último do mês
  const back = (ultimoDia.getDay() - regra.weekday + 7) % 7
  return new Date(year, regra.mes - 1, ultimoDia.getDate() - back)
}

export type DataProxima = { nome: string; dias: number; data: string; dataISO: string; ano: number }

/* Próximas datas dentro de `dentroDeDias` (default 60), ordenadas pela mais perto.
   Se a data deste ano já passou, pega a do ano que vem. */
export function proximasDatas(dentroDeDias = 60, hoje = new Date()): DataProxima[] {
  const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())
  return DATAS_COMEMORATIVAS
    .map(d => {
      let alvo = dataDoAno(d.regra, hoje.getFullYear())
      if (alvo < inicioHoje) alvo = dataDoAno(d.regra, hoje.getFullYear() + 1)
      const dias = Math.round((alvo.getTime() - inicioHoje.getTime()) / 86400000)
      return {
        nome: d.nome,
        dias,
        data: `${String(alvo.getDate()).padStart(2, '0')}/${String(alvo.getMonth() + 1).padStart(2, '0')}`,
        dataISO: `${alvo.getFullYear()}-${String(alvo.getMonth() + 1).padStart(2, '0')}-${String(alvo.getDate()).padStart(2, '0')}`,
        ano: alvo.getFullYear(),
      }
    })
    .filter(d => d.dias <= dentroDeDias)
    .sort((a, b) => a.dias - b.dias)
}
