import Link from 'next/link'

export default function PrivacidadePage() {
  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-300 px-4 py-12">
      <div className="max-w-2xl mx-auto">

        <Link href="/" className="text-sm text-violet-400 hover:text-violet-300 transition mb-8 inline-block">
          ← Voltar
        </Link>

        <h1 className="text-2xl font-bold text-white mb-2">Política de Privacidade</h1>
        <p className="text-sm text-zinc-500 mb-8">Última atualização: julho de 2026</p>

        <div className="space-y-6 text-sm leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-white mb-2">1. Quem somos</h2>
            <p>O Zivo é uma plataforma de gestão para lojistas. Esta política descreve como coletamos, usamos e protegemos os dados pessoais de acordo com a Lei Geral de Proteção de Dados (LGPD — Lei nº 13.709/2018).</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">2. Dados que coletamos</h2>
            <p>Coletamos os seguintes dados:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong className="text-zinc-200">Do lojista:</strong> e-mail, nome da loja, endereço, dados de configuração</li>
              <li><strong className="text-zinc-200">Dos clientes do lojista:</strong> nome, telefone, e-mail, data de nascimento, tamanhos, observações — inseridos pelo próprio lojista</li>
              <li><strong className="text-zinc-200">De uso:</strong> registros de vendas, estoque, mensagens do WhatsApp processadas</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">3. Como usamos os dados</h2>
            <ul className="list-disc pl-5 space-y-1">
              <li>Fornecer e melhorar os serviços da plataforma</li>
              <li>Gerar análises e recomendações com inteligência artificial</li>
              <li>Permitir o atendimento via WhatsApp automatizado</li>
              <li>Comunicar atualizações importantes do serviço</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">4. Compartilhamento de dados</h2>
            <p>Não vendemos nem compartilhamos seus dados com terceiros, exceto:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li><strong className="text-zinc-200">Supabase:</strong> banco de dados e autenticação (servidores nos EUA com cláusulas contratuais adequadas)</li>
              <li><strong className="text-zinc-200">Anthropic:</strong> processamento de IA para análises e respostas automáticas (conteúdo anonimizado)</li>
              <li><strong className="text-zinc-200">Vercel:</strong> hospedagem da aplicação</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">5. Segurança</h2>
            <p>Utilizamos criptografia em trânsito (HTTPS) e em repouso. O acesso aos dados é controlado por autenticação e políticas de segurança por linha (RLS) no banco de dados. Cada lojista acessa apenas seus próprios dados.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">6. Seus direitos (LGPD)</h2>
            <p>Como titular de dados, você tem direito a:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Confirmar a existência de tratamento dos seus dados</li>
              <li>Acessar, corrigir ou excluir seus dados</li>
              <li>Solicitar a portabilidade dos dados</li>
              <li>Revogar o consentimento a qualquer momento</li>
            </ul>
            <p className="mt-2">Para exercer seus direitos, entre em contato pelo e-mail da plataforma.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">7. Retenção de dados</h2>
            <p>Os dados são mantidos enquanto a conta estiver ativa. Após o cancelamento, os dados são excluídos em até 30 dias, salvo obrigação legal de retenção.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">8. Cookies</h2>
            <p>Utilizamos cookies de sessão estritamente necessários para autenticação. Não utilizamos cookies de rastreamento ou publicidade.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">9. Contato</h2>
            <p>Para dúvidas ou solicitações relacionadas à privacidade, entre em contato pelo e-mail disponibilizado na plataforma.</p>
          </section>

        </div>

        <div className="mt-8 pt-6 border-t border-zinc-800">
          <Link href="/termos" className="text-sm text-violet-400 hover:text-violet-300 transition">
            Ver Termos de Uso →
          </Link>
        </div>
      </div>
    </main>
  )
}
