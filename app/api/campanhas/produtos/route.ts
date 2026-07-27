import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/* Busca produtos do estoque pro picker da Consultora — só o que TEM
   em estoque (qtd > 0), com os tamanhos reais. Assim o dono seleciona
   o produto certo e a IA trabalha com dado de verdade (sem adivinhar). */

/* eslint-disable @typescript-eslint/no-explicit-any */
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new NextResponse('Unauthorized', { status: 401 })

  const termo = (request.nextUrl.searchParams.get('termo') || '').trim()

  let q = supabase
    .from('estoque')
    .select('id, nome, marca, cor, genero, tamanhos, preco_venda')
    .eq('user_id', user.id)

  if (termo) {
    q = q.or(`nome.ilike.%${termo}%,marca.ilike.%${termo}%,cor.ilike.%${termo}%`)
  }

  const { data } = await q.order('created_at', { ascending: false }).limit(60)

  const produtos = (data ?? []).map((p: any) => {
    const grade = (Array.isArray(p.tamanhos) ? p.tamanhos : [])
      .filter((t: any) => (Number(t.qtd) || 0) > 0)
      .map((t: any) => ({ tamanho: String(t.tamanho), qtd: Number(t.qtd) || 0 }))
    return {
      id: p.id,
      nome: p.nome,
      marca: p.marca,
      cor: p.cor,
      genero: p.genero ?? null,
      preco: p.preco_venda,
      grade,
      tamanhos: grade.map((g: any) => g.tamanho),
      resumo: grade.map((g: any) => `${g.tamanho}(${g.qtd})`).join(' · '),
    }
  }).filter((p: any) => p.grade.length > 0)

  return NextResponse.json({ produtos: produtos.slice(0, 40) })
}
