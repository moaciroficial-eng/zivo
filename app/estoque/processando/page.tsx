import { redirect } from 'next/navigation'

// Esta rota não é mais usada — o scan agora vai direto via form para a server action
export default function ProcessandoPage() {
  redirect('/estoque/novo')
}
