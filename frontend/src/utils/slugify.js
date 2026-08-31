/**
 * Utility to convert broker name into a URL-friendly slug for logo path matching.
 * @param {string} text
 * @returns {string}
 */
export const slugifyBroker = (text) => {
  if (!text) return '';
  
  // Exact mappings for our downloaded Fintables logos
  const exactMap = {
    "A1 Capital": "a1_capital",
    "Ahlatcı Yatırım": "ahlatci_yatirim",
    "Ak Yatırım": "ak_yatirim",
    "Alnus Yatırım": "alnus_yatirim",
    "Ata Yatırım": "ata_yatirim",
    "Ata": "ata_yatirim",
    "Anadolu": "anadolu",
    "BofA": "bank_of_america",
    "Bulls Yatırım": "bulls_yatirim",
    "Citi": "citi",
    "Destek Yatırım": "destek_yatirim",
    "Deniz Yatırım": "deniz_yatirim",
    "Fiba Yatırım": "fiba_yatirim",
    "Garanti BBVA": "garanti_yatirim",
    "Gedik Yatırım": "gedik_yatirim",
    "Global Menkul": "global_menkul",
    "GCM": "gcm",
    "Goldman Sachs": "goldman_sachs",
    "Halk Yatırım": "halk_yatirim",
    "HSBC": "hsbc",
    "ICBC": "icbc",
    "İnfo Yatırım": "info_yatirim",
    "İntegral Yatırım": "integral_yatirim",
    "İş Yatırım": "is_yatirim",
    "J.P. Morgan": "jp_morgan",
    "Kuveyt Türk": "kuveyt_turk_yatirim",
    "Kuzey": "kuzey",
    "Marbaş": "marbas",
    "Midas": "midas",
    "Osmanlı Yatırım": "osmanli_yatirim",
    "Oyak Yatırım": "oyak_yatirim",
    "PhillipCapital": "phillip_capital",
    "Pusula Yatırım": "pusula_yatirim",
    "QNB Yatırım": "qnb_yatirim",
    "QNB": "qnb_yatirim",
    "Şeker Yatırım": "seker_yatirim",
    "Tacirler Yatırım": "tacirler_yatirim",
    "TEB Yatırım": "teb_yatirim",
    "Tera Yatırım": "tera_yatirim",
    "Trive": "trive",
    "Ünlü & Co": "unlu",
    "Vakıf Yatırım": "vakif_yatirim",
    "Yapı Kredi Yatırım": "yapi_kredi_yatirim",
    "Yatırım Finansman": "yatirim_finansman",
    "Yatırım Finansman": "yatirim_finansman",
    "Ziraat Yatırım": "ziraat_yatirim"
  };

  if (exactMap[text]) {
    return exactMap[text];
  }

  // Fallback slugification
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
  return t;
};

export default slugifyBroker;
