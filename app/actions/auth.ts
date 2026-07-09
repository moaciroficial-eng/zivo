'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type LoginState = { error: string } | undefined
export type ActionState = { error?: string; success?: string } | undefined

export async function login(_state: LoginState, formData: FormData): Promise<LoginState> {
  const supabase = await createClient()

  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) {
    return { error: 'Email ou senha inválidos.' }
  }

  redirect('/dashboard')
}

export async function logout() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/')
}

export async function signup(_state: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient()

  const email    = formData.get('email') as string
  const password = formData.get('password') as string
  const nomeLoja = formData.get('nome_loja') as string

  if (!email || !password || !nomeLoja) {
    return { error: 'Preencha todos os campos.' }
  }

  if (password.length < 6) {
    return { error: 'A senha deve ter pelo menos 6 caracteres.' }
  }

  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    if (error.message.includes('already registered')) {
      return { error: 'Este e-mail já está cadastrado.' }
    }
    return { error: 'Erro ao criar conta. Tente novamente.' }
  }

  if (data.user) {
    await supabase.from('loja_config').upsert({
      user_id:   data.user.id,
      nome_loja: nomeLoja,
    }, { onConflict: 'user_id' })
  }

  redirect('/onboarding')
}

export async function resetPassword(_state: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient()
  const email = formData.get('email') as string

  if (!email) return { error: 'Informe seu e-mail.' }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://zivo-navy.vercel.app'

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl}/reset-password`,
  })

  if (error) return { error: 'Erro ao enviar o e-mail. Verifique o endereço.' }

  return { success: 'E-mail enviado! Verifique sua caixa de entrada.' }
}
