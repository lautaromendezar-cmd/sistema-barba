const DIACRITICOS = /[\u0300-\u036F]/g;

/**
 * Para buscar: minúsculas y sin tildes.
 * Nadie escribe "Dom Pérignon" con acento cuando está apurado cargando un
 * remito, y los nombres de la lista vienen con tildes.
 */
export function normalizar(texto: string) {
  return texto.normalize("NFD").replace(DIACRITICOS, "").toLowerCase().trim();
}

export function coincide(texto: string, consulta: string) {
  return normalizar(texto).includes(normalizar(consulta));
}
