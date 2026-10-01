-- Que las otras PC se enteren de lo que hizo una.
--
-- La app baja los datos al entrar y despues de cada operacion propia. Con tres
-- PC abiertas a la vez, un remito emitido en una no aparecia en las otras hasta
-- refrescar la pagina, y en el deposito no sabian si el pedido estaba cargado o
-- no: el riesgo es cargarlo dos veces.
--
-- Supabase Realtime avisa de cada cambio a quien este suscripto. La app no usa
-- el contenido del aviso, solo lo toma como "volve a pedir esta parte", asi que
-- los datos siguen llegando por las mismas consultas de siempre.
--
-- Realtime evalua las politicas de lectura de cada tabla para cada suscriptor:
-- quien no es del equipo (`es_del_equipo()`, 0004) no recibe nada. Lo prueba
-- `scripts/probar_avisos_en_vivo.ts`.

alter publication supabase_realtime add table
  remitos,
  remito_lineas,
  ingresos,
  ingreso_lineas,
  movimientos,
  clientes,
  cliente_direcciones,
  productos,
  proveedores;
