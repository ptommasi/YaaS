import { Logger } from "../logger";

// Conditions enum and possible condition in different languages:
// enum Condition  {  <- enum can't go in the declaration file, I have to work with strings
//             New,    LikeNew,                                  VeryGood,                   Good,                     Acceptable,                 Renewed,          
//             Unknown 
// };
// English: New,    Used - Like New or Open Box,              Used - Very Good,           Used - Good,              Used - Acceptable,          Renewed / Refurbished
// French:  Neuf,   D'occasion - Comme neuf ou Boîte ouverte, D'occasion - Très bon état, D'occasion - Bon état,    D'occasion - Etat correct,  Reconditionné
// Italian: Nuovo,  Usato - Come nuovo o Confezione aperta,   Usato - Ottime condizioni,  Usato - Buone condizioni, Usato - Accettabile,        Ricondizionato
// Spanish: Nuevo,  Usado - Como nuevo o embalaje abierto,    Usado - Muy bueno,          Usado - Bueno,            Usado - Aceptable,          Reacondicionados
// German:  Neu,    Gebraucht - Wie neu,                      Gebraucht - Sehr gut,       Gebraucht - Gut,          Gebraucht - Akzeptabel,     Generalüberholte

const keywordsForNew        = [ "new",                    "neuf",           "nuovo",          "nuevo",                    "neu"               ];
const keywordsForUsed       = [ "used",                   "occasion",       "usato",          "usado", "como",            "gebraucht"         ];
const keywordsForVeryGood   = [ "very good",              "très bon",       "ottime",         "muy bueno", "como nuevo",  "sehr gut"          ];
const keywordsForGood       = [ "good",                   "très",           "buone",          "bueno",                    "gut"               ];
const keywordsForAcceptable = [ "acceptable",             "correct",        "accettabile",    "aceptable",                "akzeptabel"        ];
const keywordsForRenews     = [ "renews", "refurbished",  "reconditionné",  "ricondizionato", "reacondicionados",         "generalüberholte"  ];

export function parseCondition(id: string, rawCondition: string): ParsedCondition {

  const logger = new Logger(id);

  const lRawConditions       = rawCondition.toLowerCase();
  const hasNewKeyword        = keywordsForNew       .some(n => lRawConditions.indexOf(n) >= 0 && lRawConditions.indexOf("renew") < 0);
  const hasUsedKeyword       = keywordsForUsed      .some(n => lRawConditions.indexOf(n) >= 0);
  const hasVeryGoodKeyword   = keywordsForVeryGood  .some(v => lRawConditions.indexOf(v) >= 0);
  const hasGoodKeyword       = keywordsForGood      .some(v => lRawConditions.indexOf(v) >= 0);
  const hasAcceptableKeyword = keywordsForAcceptable.some(v => lRawConditions.indexOf(v) >= 0);
  const hasRenewedKeyword    = keywordsForRenews    .some(v => lRawConditions.indexOf(v) >= 0);

  if (hasNewKeyword && hasUsedKeyword) {
    return "LikeNew";
  }

  if (hasNewKeyword) {
    return "New";
  }

  if (hasUsedKeyword) {
    if (hasVeryGoodKeyword) {
      return "VeryGood";
    }
    if (hasGoodKeyword) {
      return "Good";
    }
    if (hasAcceptableKeyword) {
      return "Acceptable";
    }
  }

  if (hasRenewedKeyword) {
    return "Renewed";
  }

  logger.warn(`Impossible to understand the conditions for string '${rawCondition}'`);
  return "Unknown";

}
