-- Acrescenta "local" como sinônimo natural de endereço no seed de
-- horário/endereço -- só atualiza quem ainda está com o texto placeholder
-- original (não sobrescreve o que o dono já editou).
update respostas_prontas
set texto = 'A gente atende [cole seu horário aqui] no endereço (local): [cole seu endereço aqui].'
where atalho = 'horario'
  and texto = 'A gente atende [cole seu horário aqui]. Endereço: [cole seu endereço aqui].';
