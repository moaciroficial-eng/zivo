-- CPF do cliente (guardado só com dígitos). Opcional.
alter table clientes
  add column if not exists cpf text;
