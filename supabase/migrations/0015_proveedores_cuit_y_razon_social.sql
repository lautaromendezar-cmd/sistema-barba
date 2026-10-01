-- Razon social y CUIT de los proveedores.
--
-- La primera lista de proveedores (planilla del 26-sep) traia solo como los
-- llaman ("GUIDO", "MATI LA AZUL"); los dos que tenian CUIT lo traian pegado
-- al nombre. El 1-oct llego la lista de los que facturan, con razon social y
-- CUIT: van en columnas propias. `nombre` sigue siendo como lo llaman en el
-- deposito, igual que el apodo de los clientes (0013).
--
-- El CUIT se guarda siempre con guiones (30-71029502-2) y con el digito
-- verificador correcto: un CUIT mal tipeado no entra. Dos proveedores no
-- pueden tener el mismo.

alter table proveedores add column if not exists razon_social text;
alter table proveedores add column if not exists cuit text;

create or replace function cuit_valido(p text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  n text := replace(p, '-', '');
  pesos int[] := array[5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  suma int := 0;
  esperado int;
begin
  if p !~ '^\d{2}-\d{8}-\d$' then
    return false;
  end if;
  for i in 1..10 loop
    suma := suma + substr(n, i, 1)::int * pesos[i];
  end loop;
  esperado := 11 - suma % 11;
  if esperado = 11 then esperado := 0; end if;
  if esperado = 10 then esperado := 9; end if;
  return esperado = substr(n, 11, 1)::int;
end;
$$;

alter table proveedores
  add constraint proveedores_cuit_valido check (cuit is null or cuit_valido(cuit));

create unique index if not exists proveedores_cuit_unico
  on proveedores (cuit) where cuit is not null;
