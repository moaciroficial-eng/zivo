import forge from 'node-forge'

/* Lê um certificado A1 (.pfx/.p12) em base64 e devolve a validade de cada
   certificado que ele contém. Serve pra diagnosticar o erro "prazo de
   validade vencido" — às vezes o arquivo subido é o antigo, ou o pacote
   traz o certificado velho junto do novo. */

export type CertInfo = {
  titular: string
  emissor: string
  de: string          // ISO
  ate: string         // ISO
  vencido: boolean
  dias_restantes: number
  eh_autoridade: boolean   // true = certificado da AC (cadeia), não o da loja
}

export function lerCertificadosP12(base64: string, senha: string): CertInfo[] {
  const der = forge.util.decode64(base64)
  const asn1 = forge.asn1.fromDer(der)
  const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, senha)

  const bags = p12.getBags({ bagType: forge.pki.oids.certBag })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const certBags = (bags[forge.pki.oids.certBag] ?? []) as any[]
  const agora = Date.now()

  const cn = (attrs: { shortName?: string; name?: string; value?: unknown }[]) => {
    const a = attrs.find(x => x.shortName === 'CN' || x.name === 'commonName')
    return a?.value ? String(a.value) : ''
  }

  return certBags
    .filter(b => b.cert)
    .map(b => {
      const c = b.cert
      const ate: Date = c.validity.notAfter
      const de: Date = c.validity.notBefore
      let ehCA = false
      try {
        const bc = c.getExtension('basicConstraints')
        ehCA = !!(bc && bc.cA)
      } catch { /* sem a extensão */ }
      return {
        titular: cn(c.subject.attributes),
        emissor: cn(c.issuer.attributes),
        de: de.toISOString(),
        ate: ate.toISOString(),
        vencido: ate.getTime() < agora,
        dias_restantes: Math.round((ate.getTime() - agora) / 86400000),
        eh_autoridade: ehCA,
      }
    })
}
