-- Cada alta de cliente gastaba DOS numeros (C-0593, C-0595, ...).
--
-- La 0013 dejo la columna con `default nextval(...)` y ademas el trigger
-- `fijar_numero_de_cliente` hace otro `nextval` en el INSERT. Postgres evalua
-- el default antes de que corra el trigger, asi que cada alta consumia uno que
-- despues el trigger pisaba. Se vio al cargar los 24 clientes del 9-oct.
--
-- El que manda es el trigger (ignora lo que mande el navegador), asi que el
-- default sobra. Sin default, el INSERT llega con numero null, el trigger lo
-- completa y el not null se controla despues de los triggers BEFORE.

alter table clientes alter column numero drop default;
