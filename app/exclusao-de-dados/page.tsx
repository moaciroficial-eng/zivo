import Link from 'next/link'

export const metadata = { title: 'Exclusão de Dados — Zivo' }

export default function ExclusaoDeDadosPage() {
  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-300 px-4 py-12">
      <div className="max-w-2xl mx-auto">

        <Link href="/" className="text-sm text-violet-400 hover:text-violet-300 transition mb-8 inline-block">
          ← Voltar
        </Link>

        <h1 className="text-2xl font-bold text-white mb-2">Exclusão de Dados</h1>
        <p className="text-sm text-zinc-500 mb-8">Última atualização: agosto de 2026</p>

        <div className="space-y-6 text-sm leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-white mb-2">Como solicitar a exclusão dos seus dados</h2>
            <p>O Zivo é uma plataforma de gestão para lojistas. Você tem o direito de solicitar a exclusão de todos os seus dados pessoais a qualquer momento, de acordo com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">Se você é lojista (tem uma conta no Zivo)</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Envie um e-mail para <strong className="text-zinc-200">moaciroficial@gmail.com</strong> a partir do endereço cadastrado na sua conta, com o assunto <em>“Exclusão de dados”</em>.</li>
              <li>Confirmaremos sua identidade e excluiremos permanentemente sua conta e todos os dados associados (loja, clientes, vendas, estoque e mensagens) em até <strong className="text-zinc-200">30 dias</strong>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">Se você é cliente de uma loja que usa o Zivo</h2>
            <p>Seus dados (nome, telefone, e-mail) foram cadastrados pela própria loja. Você pode:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Pedir a exclusão diretamente à loja com quem você se relaciona; ou</li>
              <li>Enviar um e-mail para <strong className="text-zinc-200">moaciroficial@gmail.com</strong> informando seu nome e telefone. Encaminharemos a solicitação à loja responsável e removeremos seus dados dos nossos sistemas em até <strong className="text-zinc-200">30 dias</strong>.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">Dados do WhatsApp</h2>
            <p>Quando uma loja conecta o WhatsApp oficial (Meta) ao Zivo, processamos as mensagens apenas para viabilizar o atendimento em nome da loja. Ao excluir a conta ou desconectar o WhatsApp, esses dados também são removidos dentro do mesmo prazo de 30 dias.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">Contato</h2>
            <p>Para qualquer dúvida sobre exclusão de dados, escreva para <strong className="text-zinc-200">moaciroficial@gmail.com</strong>.</p>
          </section>

        </div>

        <div className="mt-8 pt-6 border-t border-zinc-800">
          <Link href="/privacidade" className="text-sm text-violet-400 hover:text-violet-300 transition">
            Ver Política de Privacidade →
          </Link>
        </div>
      </div>
    </main>
  )
}
