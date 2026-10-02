import { gunzipSync } from 'zlib';

/** XML da nota: o robô grava comprimido (xml_gz, gzip em base64); notas antigas têm xml puro. */
export function xmlDaNota(nota: { xml?: string | null; xml_gz?: string | null } | null): string | null {
  if (!nota) return null;
  if (nota.xml) return nota.xml;
  if (nota.xml_gz) return gunzipSync(Buffer.from(nota.xml_gz, 'base64')).toString('utf8');
  return null;
}
