import Link from 'next/link'
import type { Metadata } from 'next'
import { Sora } from 'next/font/google'
import { createClient } from '@/lib/supabase/server'

const display = Sora({ subsets: ['latin'], weight: ['600', '700', '800'] })

export const metadata: Metadata = {
  title: 'Zivo — sua loja vendendo todos os dias, no automático',
  description: 'O Zivo transforma os clientes que você já tem em vendas: acha quem quer cada produto, monta a campanha e fala no WhatsApp por você. Feito pra loja de roupas.',
}

/* Planos — ajuste os preços aqui quando definir o billing */
const PLANOS = [
  {
    nome: 'Essencial', preco: '97', destaque: false,
    desc: 'Comece a vender mais com a base que você já tem.',
    itens: ['Oportunidades do dia (produto × cliente certo)', 'Plano de vendas diário', 'Atendimento no WhatsApp', 'Importar clientes e estoque em minutos'],
  },
  {
    nome: 'Pro', preco: '197', destaque: true,
    desc: 'A loja no automático — campanhas, aprendizado e tudo incluso.',
    itens: ['Tudo do Essencial', 'Consultora de Campanhas', 'Lembretes e pós-venda automáticos', 'Aniversário automático', 'Aprende o que vende na sua loja'],
  },
]

export default async function LandingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  return (
    <div className="min-h-screen bg-[#070A0F] text-white antialiased selection:bg-violet-500/30">
      {/* Nav */}
      <nav className="sticky top-0 z-40 backdrop-blur-xl bg-[#070A0F]/70 border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className={`${display.className} text-lg font-bold tracking-tight`}>zivo</span>
          </div>
          <div className="flex items-center gap-1">
            <a href="#ecossistema" className="hidden sm:inline text-sm text-zinc-400 hover:text-white px-3 py-2 rounded-lg transition">Como funciona</a>
            <a href="#planos" className="hidden sm:inline text-sm text-zinc-400 hover:text-white px-3 py-2 rounded-lg transition">Planos</a>
            {user ? (
              <Link href="/dashboard" className="text-sm font-semibold bg-white text-zinc-950 hover:bg-zinc-200 rounded-full px-4 py-2 transition">Ir pro painel</Link>
            ) : (
              <>
                <Link href="/login" className="text-sm text-zinc-300 hover:text-white px-3 py-2 transition">Entrar</Link>
                <Link href="/signup" className="text-sm font-semibold bg-white text-zinc-950 hover:bg-zinc-200 rounded-full px-4 py-2 transition">Começar</Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero — foco no RESULTADO */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(70%_55%_at_50%_-10%,rgba(124,58,237,0.22),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(40%_40%_at_85%_20%,rgba(0,212,170,0.10),transparent_60%)]" />
        <div className="relative max-w-4xl mx-auto px-6 pt-24 pb-20 text-center">
          <span className="inline-flex items-center gap-2 text-xs font-medium text-zinc-300 bg-white/5 border border-white/10 rounded-full px-3.5 py-1.5 mb-7">
            <span className="w-1.5 h-1.5 rounded-full bg-[#00D4AA]" /> Pra loja de roupas
          </span>
          <h1 className={`${display.className} text-[2.7rem] sm:text-[4.2rem] font-extrabold tracking-[-0.03em] leading-[1.02]`}>
            Sua loja vendendo<br />
            <span className="bg-gradient-to-r from-violet-300 via-violet-400 to-indigo-400 bg-clip-text text-transparent">todos os dias</span>, no automático
          </h1>
          <p className="text-lg sm:text-xl text-zinc-400 mt-7 max-w-2xl mx-auto leading-relaxed">
            O Zivo transforma os clientes que você <span className="text-zinc-200">já tem</span> em vendas — acha quem quer cada produto, monta a campanha e fala no WhatsApp por você. Sem precisar lembrar de nada.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-10">
            <Link href={user ? '/dashboard' : '/signup'} className="group w-full sm:w-auto text-center font-semibold bg-white text-zinc-950 hover:bg-zinc-200 rounded-full px-8 py-4 transition shadow-2xl shadow-violet-900/30">
              {user ? 'Ir pro painel' : 'Começar agora'} <span className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
            <a href="#ecossistema" className="w-full sm:w-auto text-center text-zinc-200 border border-white/10 hover:border-white/25 bg-white/[0.02] rounded-full px-8 py-4 transition">Ver como funciona</a>
          </div>
          <p className="text-xs text-zinc-600 mt-5">Sem cartão pra testar · configuração guiada em minutos · seu número de WhatsApp</p>
        </div>
      </section>

      {/* ECOSSISTEMA — o mapa (peça central) */}
      <section id="ecossistema" className="max-w-5xl mx-auto px-6 py-20">
        <div className="text-center mb-14">
          <p className="text-sm font-semibold text-violet-300 mb-2">O ecossistema Zivo</p>
          <h2 className={`${display.className} text-3xl sm:text-4xl font-bold tracking-tight`}>Uma máquina de vendas. Não uma featurezinha.</h2>
          <p className="text-zinc-400 mt-3 max-w-xl mx-auto">Tudo o que você já tem vira venda — e o Zivo aprende com o resultado pra ficar melhor a cada dia.</p>
        </div>

        <div className="flex flex-col items-center gap-0">
          {/* 1. Entra */}
          <MapaEtapa n="1" titulo="O que entra" cor="zinc">
            <div className="flex flex-wrap justify-center gap-2">
              {['👥 Seus clientes', '📦 Seu estoque', '🧾 Suas vendas', '💬 WhatsApp'].map(x => (
                <span key={x} className="text-sm text-zinc-300 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">{x}</span>
              ))}
            </div>
          </MapaEtapa>

          <Conector />

          {/* 2. Cérebro — destaque */}
          <div className="relative w-full max-w-md">
            <div className="absolute -inset-4 bg-[radial-gradient(50%_60%_at_50%_50%,rgba(124,58,237,0.25),transparent)] blur-xl" />
            <div className="relative rounded-2xl border border-violet-400/40 bg-gradient-to-b from-violet-600/20 to-indigo-600/5 p-5 text-center">
              <div className="text-3xl mb-1">🧠</div>
              <p className={`${display.className} font-bold text-white`}>O cérebro do Zivo</p>
              <p className="text-sm text-zinc-300 mt-1">Cruza tudo e acha <span className="text-white font-medium">quem quer comprar cada produto</span> — por tamanho, marca e comportamento.</p>
            </div>
          </div>

          <Conector />

          {/* 3. Vira ação */}
          <MapaEtapa n="3" titulo="Vira ação" cor="zinc">
            <div className="grid sm:grid-cols-3 gap-2.5 w-full">
              {[
                { e: '📅', t: 'Plano do dia', d: 'O que priorizar e quem chamar pra bater a meta' },
                { e: '🎯', t: 'Campanhas', d: 'A consultora monta a oferta e o público certo' },
                { e: '💬', t: 'Atendimento', d: 'Responde, oferece e fecha no WhatsApp' },
              ].map(a => (
                <div key={a.t} className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-left">
                  <div className="text-xl mb-1">{a.e}</div>
                  <p className="text-sm font-semibold text-white">{a.t}</p>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{a.d}</p>
                </div>
              ))}
            </div>
          </MapaEtapa>

          <Conector />

          {/* 4. Resultado */}
          <div className="w-full max-w-md rounded-2xl border border-[#00D4AA]/30 bg-[#00D4AA]/[0.06] p-5 text-center">
            <p className={`${display.className} text-lg font-bold text-white`}>💰 Resultado: mais vendas, todo dia</p>
            <p className="text-sm text-zinc-300 mt-1">Do cliente sumido que volta ao produto parado que gira.</p>
          </div>

          {/* Loop */}
          <div className="mt-5 flex items-center gap-2 text-sm text-zinc-400 bg-white/5 border border-white/10 rounded-full px-4 py-2">
            <span className="text-violet-300">↺</span> E aprende: lê o que converteu e melhora sozinho
          </div>
        </div>
      </section>

      {/* Prova / diferencial em 3 linhas */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { t: 'Vende com quem você já tem', d: 'Não precisa gastar em anúncio pra achar cliente novo. O Zivo faz a base que você já tem comprar mais.' },
            { t: 'Do jeito que você fala', d: 'A mensagem sai humana, no seu tom, do número da sua loja — não parece robô nem spam.' },
            { t: 'Você no controle', d: 'O Zivo sugere e prepara tudo; você aprova antes de enviar. Nada sai sem você deixar.' },
          ].map(x => (
            <div key={x.t} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
              <div className="w-1.5 h-6 rounded-full bg-gradient-to-b from-violet-400 to-indigo-500 mb-3" />
              <h3 className="font-semibold text-white">{x.t}</h3>
              <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feito pra quem NÃO manja de marketing */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="rounded-[2rem] border border-white/10 bg-gradient-to-b from-white/[0.04] to-transparent p-8 sm:p-12">
          <div className="text-center mb-9">
            <p className="text-sm font-semibold text-violet-300 mb-2">Sem complicação</p>
            <h2 className={`${display.className} text-3xl sm:text-4xl font-bold tracking-tight`}>Você não precisa entender de<br className="hidden sm:block" /> marketing nem de tecnologia.</h2>
            <p className="text-zinc-400 mt-3 max-w-xl mx-auto">O Zivo carrega a parte difícil. Você cuida da sua loja, ele cuida de vender.</p>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { q: '“Não sei o que postar nem o que oferecer”', a: 'A consultora te faz as perguntas certas e monta tudo pronto: a oferta, o texto, o público e até o post do Instagram.' },
              { q: '“Não entendo de desconto, público, campanha”', a: 'O Zivo decide o certo pra cada caso e te mostra do jeito simples. Você só olha e aprova.' },
              { q: '“Não sou de tecnologia, tenho medo de errar”', a: 'É só clicar. Tudo em português, do jeito de quem é do balcão — e nada sai sem você deixar.' },
            ].map(x => (
              <div key={x.q} className="rounded-2xl border border-white/8 bg-white/[0.02] p-5">
                <p className="text-sm font-semibold text-white leading-snug">{x.q}</p>
                <p className="text-sm text-zinc-400 mt-2 leading-relaxed">{x.a}</p>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-zinc-400 mt-8">
            É como ter um <span className="text-white font-medium">especialista em vendas</span> na sua loja — só que trabalhando 24h por você.
          </p>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="max-w-4xl mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className={`${display.className} text-3xl sm:text-4xl font-bold tracking-tight`}>Planos</h2>
          <p className="text-zinc-400 mt-3">Comece hoje. Cancele quando quiser.</p>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          {PLANOS.map(p => (
            <div key={p.nome} className={`relative rounded-3xl border p-7 flex flex-col ${p.destaque ? 'border-violet-400/40 bg-gradient-to-b from-violet-600/12 to-transparent' : 'border-white/10 bg-white/[0.02]'}`}>
              {p.destaque && <span className="absolute top-5 right-5 text-[11px] font-bold text-violet-100 bg-violet-500/25 rounded-full px-2.5 py-1">Mais popular</span>}
              <h3 className={`${display.className} text-xl font-bold`}>{p.nome}</h3>
              <p className="text-sm text-zinc-400 mt-1 mb-5">{p.desc}</p>
              <div className="flex items-end gap-1 mb-6">
                <span className="text-sm text-zinc-500 mb-1.5">R$</span>
                <span className={`${display.className} text-5xl font-extrabold tracking-tight`}>{p.preco}</span>
                <span className="text-sm text-zinc-500 mb-1.5">/mês</span>
              </div>
              <ul className="flex flex-col gap-2.5 mb-7 flex-1">
                {p.itens.map(it => (
                  <li key={it} className="flex items-start gap-2.5 text-sm text-zinc-300">
                    <span className="text-[#00D4AA] mt-0.5 shrink-0">✓</span>{it}
                  </li>
                ))}
              </ul>
              <Link href="/signup" className={`text-center font-semibold rounded-full px-5 py-3.5 transition ${p.destaque ? 'bg-white text-zinc-950 hover:bg-zinc-200' : 'bg-white/10 hover:bg-white/15 text-white'}`}>
                Começar com {p.nome}
              </Link>
            </div>
          ))}
        </div>
        <p className="text-center text-xs text-zinc-600 mt-5">O custo das mensagens do WhatsApp (Meta) pode ser à parte, dependendo do plano.</p>
      </section>

      {/* CTA final */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 p-12 text-center">
          <div className="absolute inset-0 bg-[radial-gradient(60%_100%_at_50%_0%,rgba(124,58,237,0.25),transparent)]" />
          <div className="relative">
            <h2 className={`${display.className} text-3xl sm:text-4xl font-bold tracking-tight`}>Sua loja vendendo sozinha começa hoje.</h2>
            <p className="text-zinc-400 mt-3 max-w-lg mx-auto">Coloca sua base e deixa o Zivo trabalhar. Em minutos você vê a primeira oportunidade.</p>
            <Link href={user ? '/dashboard' : '/signup'} className="inline-flex items-center gap-1.5 mt-8 font-semibold bg-white text-zinc-950 hover:bg-zinc-200 rounded-full px-9 py-4 transition">
              {user ? 'Ir pro painel' : 'Criar minha conta'} →
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-zinc-500">
          <div className="flex items-center gap-2"><Logo small /><span className={`${display.className} font-bold text-zinc-300`}>zivo</span></div>
          <div className="flex items-center gap-5">
            <Link href="/login" className="hover:text-zinc-300 transition">Entrar</Link>
            <Link href="/termos" className="hover:text-zinc-300 transition">Termos</Link>
            <Link href="/privacidade" className="hover:text-zinc-300 transition">Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}

/* Etapa do mapa */
function MapaEtapa({ n, titulo, children }: { n: string; titulo: string; cor: string; children: React.ReactNode }) {
  return (
    <div className="w-full max-w-md">
      <div className="flex items-center justify-center gap-2 mb-2.5">
        <span className="w-5 h-5 rounded-full bg-white/10 text-[11px] font-bold flex items-center justify-center text-zinc-300">{n}</span>
        <span className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{titulo}</span>
      </div>
      {children}
    </div>
  )
}

function Conector() {
  return <div className="w-px h-8 bg-gradient-to-b from-violet-500/50 to-violet-500/10 my-1" />
}

/* Logo Zivo — squircle com "seta de crescimento" (vende o resultado) */
function Logo({ small }: { small?: boolean }) {
  const s = small ? 24 : 32
  return (
    <svg width={s} height={s} viewBox="0 0 32 32" fill="none" className="shadow-lg shadow-violet-500/25 rounded-[9px]">
      <defs>
        <linearGradient id="zivoGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#4F46E5" />
        </linearGradient>
      </defs>
      <rect x="0.5" y="0.5" width="31" height="31" rx="9" fill="url(#zivoGrad)" />
      {/* linha de crescimento subindo */}
      <path d="M7 21 L13.5 14.5 L17.5 18 L24 10.5" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      {/* ponta da seta */}
      <path d="M24 10.5 L18.6 10.5 M24 10.5 L24 15.9" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
