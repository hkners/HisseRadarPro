/**
 * Utility to convert broker name into a URL-friendly slug for logo path matching.
 * @param {string} text
 * @returns {string}
 */
export const slugifyBroker = (text) => {
  if (!text) return '';
  let t = text.toLowerCase();
  t = t
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o');
  t = t.replace(/i̇/g, 'i');
  t = t.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  if (t === 'fibayatirim') t = 'fiba_yatirim';
  if (t === 'global_menkul') t = 'global_menkul_degerler';
  return t;
};

export default slugifyBroker;
