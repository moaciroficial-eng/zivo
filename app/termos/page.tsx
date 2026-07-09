import Link from 'next/link'

export default function TermosPage() {
  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-300 px-4 py-12">
      <div className="max-w-2xl mx-auto">

        <Link href="/" className="text-sm text-violet-400 hover:text-violet-300 transition mb-8 inline-block">
          ← Voltar
        </Link>

        <h1 className="text-2xl font-bold text-white mb-2">Termos de Uso</h1>
        <p className="text-sm text-zinc-500 mb-8">Última atualização: julho de 2026</p>

        <div className="space-y-6 text-sm leading-relaxed">

          <section>
            <h2 className="text-base font-semibold text-white mb-2">1. Aceitação dos Termos</h2>
            <p>Ao criar uma conta e utilizar o Zivo, você concorda com estes Termos de Uso. Se não concordar, não utilize o serviço.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">2. O Serviço</h2>
            <p>O Zivo é uma plataforma SaaS de gestão para lojistas do segmento de moda e calçados. Oferece funcionalidades de controle de estoque, cadastro de clientes, registro de vendas, análise de compras e atendimento via WhatsApp com auxílio de inteligência artificial.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">3. Responsabilidades do Usuário</h2>
            <p>Você é responsável por:</p>
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Manter suas credenciais de acesso em sigilo</li>
              <li>Garantir que os dados inseridos na plataforma são verídicos e legítimos</li>
              <li>Obter o consentimento de seus clientes para armazenar e tratar seus dados pessoais</li>
              <li>Usar o serviço em conformidade com a legislação brasileira aplicável</li>
            </ul>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">4. Uso Proibido</h2>
            <p>É vedado utilizar o Zivo para fins ilegais, enviar spam, burlar mecanismos de segurança, revender acesso sem autorização ou usar os dados de outros usuários.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">5. Propriedade Intelectual</h2>
            <p>O Zivo e seus componentes (código, design, marca) são de propriedade exclusiva de seus desenvolvedores. Os dados inseridos pelo usuário permanecem de propriedade do próprio usuário.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">6. Disponibilidade</h2>
            <p>O serviço é fornecido "como está". Não garantimos disponibilidade ininterrupta. Podemos realizar manutenções programadas ou não com aviso prévio quando possível.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">7. Limitação de Responsabilidade</h2>
            <p>O Zivo não se responsabiliza por perdas de dados, lucros cessantes ou danos indiretos decorrentes do uso ou impossibilidade de uso da plataforma.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">8. Cancelamento</h2>
            <p>Você pode cancelar sua conta a qualquer momento. Os dados serão mantidos por até 30 dias após o cancelamento e então excluídos permanentemente.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">9. Alterações nos Termos</h2>
            <p>Podemos atualizar estes termos. Quando isso ocorrer, notificaremos por e-mail. O uso continuado do serviço após a notificação implica aceitação dos novos termos.</p>
          </section>

          <section>
            <h2 className="text-base font-semibold text-white mb-2">10. Legislação Aplicável</h2>
            <p>Estes termos são regidos pelas leis da República Federativa do Brasil. Eventuais disputas serão resolvidas no foro da comarca de Barreiras, Bahia.</p>
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
