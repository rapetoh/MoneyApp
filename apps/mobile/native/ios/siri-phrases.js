// What Siri listens for, per language.
//
// An App Shortcut phrase is matched literally, so a French phone with a
// French Siri never matches "Log an expense in Murmur". iOS reads the
// translations from AppShortcuts.strings inside each <lang>.lproj of the
// app bundle, keyed by the English phrase exactly as SiriLogExpense.swift
// declares it. plugins/withMurmurIntents.js writes these files at prebuild
// and adds them to the target's resources.
//
// The first phrase of each list is the one Settings > Ask Siri teaches
// (i18n key `siri.phrase`); keep the two in step.
//
// ${applicationName} is Apple's placeholder. Every phrase must contain it:
// Apple gives no third-party app the right to a bare "log five dollars".
const PHRASES = {
  en: [
    'Log an expense in ${applicationName}',
    'Log a purchase in ${applicationName}',
    'Log spending in ${applicationName}',
    'Add an expense to ${applicationName}',
    'New expense in ${applicationName}',
    'Track an expense in ${applicationName}',
  ],
  fr: [
    'Enregistrer une dépense dans ${applicationName}',
    'Enregistrer un achat dans ${applicationName}',
    'Noter une dépense dans ${applicationName}',
    'Ajouter une dépense à ${applicationName}',
    'Nouvelle dépense dans ${applicationName}',
    'Suivre une dépense dans ${applicationName}',
  ],
  es: [
    'Registrar un gasto en ${applicationName}',
    'Registrar una compra en ${applicationName}',
    'Anotar un gasto en ${applicationName}',
    'Añadir un gasto a ${applicationName}',
    'Nuevo gasto en ${applicationName}',
    'Apuntar un gasto en ${applicationName}',
  ],
  pt: [
    'Registrar um gasto no ${applicationName}',
    'Registrar uma compra no ${applicationName}',
    'Anotar um gasto no ${applicationName}',
    'Adicionar um gasto ao ${applicationName}',
    'Novo gasto no ${applicationName}',
    'Lançar um gasto no ${applicationName}',
  ],
}

// The strings the intent itself shows and speaks, keyed by the English
// text in SiriLogExpense.swift (LocalizedStringResource falls back to the
// key, which is why the English column is the key and the file for `en`
// can be skipped).
const INTENT_STRINGS = {
  fr: {
    'Log an expense': 'Enregistrer une dépense',
    'What did you spend?': "Qu'avez-vous dépensé ?",
    'Say it the way you would to a person: five dollars at Walmart.':
      "Dites-le comme à une personne : cinq euros chez Carrefour.",
    'Say what you spent and Murmur files it: the amount, the merchant and the category.':
      "Dites ce que vous avez dépensé et Murmur l'enregistre : le montant, le commerçant et la catégorie.",
  },
  es: {
    'Log an expense': 'Registrar un gasto',
    'What did you spend?': '¿Qué has gastado?',
    'Say it the way you would to a person: five dollars at Walmart.':
      'Dilo como se lo dirías a una persona: cinco euros en Mercadona.',
    'Say what you spent and Murmur files it: the amount, the merchant and the category.':
      'Di lo que has gastado y Murmur lo registra: el importe, el comercio y la categoría.',
  },
  pt: {
    'Log an expense': 'Registrar um gasto',
    'What did you spend?': 'Quanto você gastou?',
    'Say it the way you would to a person: five dollars at Walmart.':
      'Fale como falaria com uma pessoa: cinco reais no Carrefour.',
    'Say what you spent and Murmur files it: the amount, the merchant and the category.':
      'Diga o que você gastou e o Murmur registra: o valor, o estabelecimento e a categoria.',
  },
}

module.exports = { PHRASES, INTENT_STRINGS, LOCALES: Object.keys(PHRASES) }
