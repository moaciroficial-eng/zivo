import Link from 'next/link'
import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Zivo — a IA que vende pela sua loja no WhatsApp',
  description: 'O Zivo cruza seus dados, acha o cliente certo pra cada produto, monta campanhas e atende no WhatsApp. Feito pra loja de roupas.',
}

/* Planos — ajuste os preços aqui quando definir o billing */
const PLANOS = [
  {
    nome: 'Essencial', preco: '97', destaque: false,
    desc: 'Pra começar a vender mais com a base que você já tem.',
    itens: ['Cérebro de oportunidades', 'Plano de vendas diário', 'Atendimento no WhatsApp', 'Importar clientes e estoque'],
  },
  {
    nome: 'Pro', preco: '197', destaque: true,
    desc: 'A loja no automático — campanhas, aprendizado e tudo incluso.',
    itens: ['Tudo do Essencial', 'Consultora de Campanhas', 'Cadência de lembretes automática', 'Aniversário e pós-venda automáticos', 'Aprende o que converte na sua loja'],
  },
]

const RECURSOS = [
  { emoji: '🧠', titulo: 'Cérebro de oportunidades', desc: 'Cruza tamanho, marca e comportamento pra achar o produto certo pra cada cliente. Chega de oferecer no escuro.' },
  { emoji: '🎯', titulo: 'Consultora de Campanhas', desc: 'Uma especialista em marketing te entrevista e monta a campanha: copy, público certo, foto e até o roteiro do Instagram.' },
  { emoji: '💬', titulo: 'Atende no WhatsApp', desc: 'Responde cliente, agenda, atualiza cadastro e manda a oferta — no número da sua loja, do jeito que você fala.' },
  { emoji: '📅', titulo: 'Plano de vendas diário', desc: 'Todo dia o Zivo diz o que fazer pra bater a meta: qual produto priorizar e qual cliente chamar, com a mensagem pronta.' },
  { emoji: '📈', titulo: 'Aprende com o resultado', desc: 'Lê o que converteu — tom, desconto, foto — e vai ficando mais certeiro a cada campanha. Com a cara da sua loja.' },
  { emoji: '📦', titulo: 'Começa rápido', desc: 'Cola sua lista de clientes e produtos de qualquer jeito — a IA organiza. Importa a nota fiscal e o estoque entra sozinho.' },
]

export default async function LandingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-[#080B10] text-white antialiased">
      {/* Nav */}
      <nav className="sticky top-0 z-40 backdrop-blur bg-[#080B10]/80 border-b border-zinc-900">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L20 7V17L12 22L4 17V7L12 2Z" stroke="white" strokeWidth="2" strokeLinejoin="round" /><circle cx="12" cy="12" r="3" fill="white" /></svg>
            </div>
            <span className="text-lg font-bold tracking-tight">zivo</span>
          </div>
          <div className="flex items-center gap-2">
            <a href="#planos" className="hidden sm:inline text-sm text-zinc-400 hover:text-white px-3 py-2 transition">Planos</a>
            {user ? (
              <Link href="/dashboard" className="text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg px-4 py-2 transition">Ir pro painel</Link>
            ) : (
              <>
                <Link href="/login" className="text-sm text-zinc-300 hover:text-white px-3 py-2 transition">Entrar</Link>
                <Link href="/signup" className="text-sm font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-lg px-4 py-2 transition shadow-lg shadow-violet-500/20">Começar</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_0%,rgba(124,58,237,0.18),transparent)]" />
        <div className="relative max-w-4xl mx-auto px-6 pt-20 pb-16 text-center">
          <span className="inline-block text-xs font-semibold text-violet-300 bg-violet-500/10 border border-violet-500/25 rounded-full px-3 py-1 mb-6">Pra loja de roupas • no WhatsApp</span>
          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight leading-[1.05]">
            A IA que <span className="bg-gradient-to-r from-violet-400 to-indigo-400 bg-clip-text text-transparent">vende pela sua loja</span> no WhatsApp
          </h1>
          <p className="text-lg text-zinc-400 mt-6 max-w-2xl mx-auto leading-relaxed">
            O Zivo cruza os seus dados, acha o cliente certo pra cada produto, monta a campanha e atende no WhatsApp — do jeito que você faria no balcão, mas no automático.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-9">
            <Link href={user ? '/dashboard' : '/signup'} className="w-full sm:w-auto text-center font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl px-7 py-3.5 transition shadow-lg shadow-violet-500/25">
              {user ? 'Ir pro painel' : 'Começar agora'}
            </Link>
            <a href="#recursos" className="w-full sm:w-auto text-center text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 rounded-xl px-7 py-3.5 transition">Ver o que faz</a>
          </div>
          <p className="text-xs text-zinc-600 mt-4">Sem cartão pra testar • configuração guiada em minutos</p>
        </div>
      </section>

      {/* Recursos */}
      <section id="recursos" className="max-w-6xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold">Não é mais um chatbot.</h2>
          <p className="text-zinc-400 mt-2 max-w-xl mx-auto">É um vendedor que conhece sua loja, seus clientes e sabe a hora de oferecer.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {RECURSOS.map(r => (
            <div key={r.titulo} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5 hover:border-zinc-700 transition">
              <div className="text-2xl mb-3">{r.emoji}</div>
              <h3 className="font-semibold text-white">{r.titulo}</h3>
              <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{r.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section className="max-w-4xl mx-auto px-6 py-14">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { n: '1', t: 'Conecte sua base', d: 'Cola seus clientes e produtos, importa a nota. Em minutos o Zivo já conhece sua loja.' },
            { n: '2', t: 'O Zivo acha as chances', d: 'Ele cruza os dados e te mostra o produto certo pra cada cliente, com a mensagem pronta.' },
            { n: '3', t: 'Você aprova, ele vende', d: 'Envia pelo WhatsApp, atende quem responde e aprende o que converte na sua loja.' },
          ].map(s => (
            <div key={s.n} className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
              <div className="w-8 h-8 rounded-lg bg-violet-500/15 text-violet-300 flex items-center justify-center font-bold mb-3">{s.n}</div>
              <h3 className="font-semibold">{s.t}</h3>
              <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold">Planos</h2>
          <p className="text-zinc-400 mt-2">Comece hoje. Cancele quando quiser.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {PLANOS.map(p => (
            <div key={p.nome} className={`rounded-2xl border p-6 flex flex-col ${p.destaque ? 'border-violet-500/50 bg-gradient-to-b from-violet-600/10 to-transparent' : 'border-zinc-800 bg-zinc-900/40'}`}>
              {p.destaque && <span className="self-start text-[11px] font-bold text-violet-200 bg-violet-500/20 rounded-full px-2.5 py-0.5 mb-3">Mais popular</span>}
              <h3 className="text-lg font-bold">{p.nome}</h3>
              <p className="text-sm text-zinc-400 mt-1 mb-4">{p.desc}</p>
              <div className="flex items-end gap-1 mb-5">
                <span className="text-sm text-zinc-500">R$</span>
                <span className="text-4xl font-extrabold">{p.preco}</span>
                <span className="text-sm text-zinc-500 mb-1">/mês</span>
              </div>
              <ul className="flex flex-col gap-2 mb-6 flex-1">
                {p.itens.map(it => (
                  <li key={it} className="flex items-start gap-2 text-sm text-zinc-300">
                    <span className="text-[#00D4AA] mt-0.5">✓</span>{it}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className={`text-center font-semibold rounded-xl px-5 py-3 transition ${p.destaque ? 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 shadow-lg shadow-violet-500/25' : 'bg-zinc-800 hover:bg-zinc-700'}`}>
                Começar com {p.nome}
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-zinc-600 mt-4">O custo das mensagens do WhatsApp (Meta) pode ser à parte, dependendo do plano.</p>
      </section>

      {/* CTA final */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="rounded-3xl border border-violet-500/30 bg-gradient-to-br from-violet-600/15 to-indigo-600/5 p-10 text-center">
          <h2 className="text-3xl font-bold">Sua loja vendendo sozinha começa hoje.</h2>
          <p className="text-zinc-400 mt-3 max-w-lg mx-auto">Coloca sua base e deixa o Zivo trabalhar. Em minutos você vê a primeira oportunidade.</p>
          <Link href={user ? '/dashboard' : '/signup'} className="inline-block mt-7 font-semibold bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 rounded-xl px-8 py-3.5 transition shadow-lg shadow-violet-500/25">
            {user ? 'Ir pro painel' : 'Criar minha conta'}
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <span className="font-bold text-zinc-300">zivo</span>
          <div className="flex items-center gap-4">
            <Link href="/login" className="hover:text-zinc-300 transition">Entrar</Link>
            <Link href="/termos" className="hover:text-zinc-300 transition">Termos</Link>
            <Link href="/privacidade" className="hover:text-zinc-300 transition">Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
