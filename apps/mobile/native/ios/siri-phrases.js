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
  en: {
    expense: [
      'Log an expense in ${applicationName}',
      'Log a purchase in ${applicationName}',
      'Log spending in ${applicationName}',
      'Add an expense to ${applicationName}',
      'Add an expense in ${applicationName}',
      'New expense in ${applicationName}',
      'Track an expense in ${applicationName}',
      'Record an expense in ${applicationName}',
      'Note an expense in ${applicationName}',
      'Start an expense in ${applicationName}',
      '${applicationName} expense',
      '${applicationName} log an expense',
    ],
    income: [
      'Log income in ${applicationName}',
      'Log a payment in ${applicationName}',
      'Add income to ${applicationName}',
      'Record income in ${applicationName}',
      'New income in ${applicationName}',
      'Log a deposit in ${applicationName}',
      '${applicationName} income',
      '${applicationName} log income',
    ],
  },
  fr: {
    expense: [
      'Enregistrer une dépense dans ${applicationName}',
      'Enregistrer un achat dans ${applicationName}',
      'Noter une dépense dans ${applicationName}',
      'Ajouter une dépense à ${applicationName}',
      'Ajouter une dépense dans ${applicationName}',
      'Nouvelle dépense dans ${applicationName}',
      'Suivre une dépense dans ${applicationName}',
      'Inscrire une dépense dans ${applicationName}',
      'Noter un achat dans ${applicationName}',
      'Commencer une dépense dans ${applicationName}',
      'Dépense ${applicationName}',
      '${applicationName} noter une dépense',
    ],
    income: [
      'Enregistrer un revenu dans ${applicationName}',
      'Noter un revenu dans ${applicationName}',
      'Ajouter un revenu à ${applicationName}',
      'Enregistrer un paiement reçu dans ${applicationName}',
      'Nouveau revenu dans ${applicationName}',
      "Enregistrer une rentrée d'argent dans ${applicationName}",
      'Revenu ${applicationName}',
      '${applicationName} noter un revenu',
    ],
  },
  es: {
    expense: [
      'Registrar un gasto en ${applicationName}',
      'Registrar una compra en ${applicationName}',
      'Anotar un gasto en ${applicationName}',
      'Añadir un gasto a ${applicationName}',
      'Añadir un gasto en ${applicationName}',
      'Nuevo gasto en ${applicationName}',
      'Apuntar un gasto en ${applicationName}',
      'Guardar un gasto en ${applicationName}',
      'Anotar una compra en ${applicationName}',
      'Empezar un gasto en ${applicationName}',
      'Gasto en ${applicationName}',
      '${applicationName} registrar un gasto',
    ],
    income: [
      'Registrar un ingreso en ${applicationName}',
      'Anotar un ingreso en ${applicationName}',
      'Añadir un ingreso a ${applicationName}',
      'Registrar un cobro en ${applicationName}',
      'Nuevo ingreso en ${applicationName}',
      'Apuntar un ingreso en ${applicationName}',
      'Ingreso en ${applicationName}',
      '${applicationName} registrar un ingreso',
    ],
  },
  pt: {
    expense: [
      'Registrar um gasto no ${applicationName}',
      'Registrar uma compra no ${applicationName}',
      'Anotar um gasto no ${applicationName}',
      'Adicionar um gasto ao ${applicationName}',
      'Adicionar um gasto no ${applicationName}',
      'Novo gasto no ${applicationName}',
      'Lançar um gasto no ${applicationName}',
      'Salvar um gasto no ${applicationName}',
      'Anotar uma compra no ${applicationName}',
      'Começar um gasto no ${applicationName}',
      'Gasto no ${applicationName}',
      '${applicationName} registrar um gasto',
    ],
    income: [
      'Registrar uma receita no ${applicationName}',
      'Anotar uma receita no ${applicationName}',
      'Adicionar uma receita ao ${applicationName}',
      'Registrar um recebimento no ${applicationName}',
      'Nova receita no ${applicationName}',
      'Lançar uma receita no ${applicationName}',
      'Receita no ${applicationName}',
      '${applicationName} registrar uma receita',
    ],
  },
}

// The strings the intent itself shows and speaks, keyed by the English
// text in SiriLogExpense.swift (LocalizedStringResource falls back to the
// key, which is why the English column is the key and the file for `en`
// can be skipped).
const INTENT_STRINGS = {
  fr: {
    'Log an expense': 'Enregistrer une dépense',
    'Log income': 'Enregistrer un revenu',
    'What did you spend?': "Qu'avez-vous dépensé ?",
    'What came in?': "Qu'avez-vous reçu ?",
    'Say it the way you would to a person: two hundred from Acme.':
      "Dites-le comme à une personne : deux cents euros de la part d'Acme.",
    'Say what came in and Murmur files it: the amount and where it came from.':
      "Dites ce que vous avez reçu et Murmur l'enregistre : le montant et la provenance.",
    'Say it the way you would to a person: five dollars at Walmart.':
      "Dites-le comme à une personne : cinq euros chez Carrefour.",
    'Say what you spent and Murmur files it: the amount, the merchant and the category.':
      "Dites ce que vous avez dépensé et Murmur l'enregistre : le montant, le commerçant et la catégorie.",
  },
  es: {
    'Log an expense': 'Registrar un gasto',
    'Log income': 'Registrar un ingreso',
    'What did you spend?': '¿Qué has gastado?',
    'What came in?': '¿Qué has recibido?',
    'Say it the way you would to a person: two hundred from Acme.':
      'Dilo como se lo dirías a una persona: doscientos euros de Acme.',
    'Say what came in and Murmur files it: the amount and where it came from.':
      'Di lo que has recibido y Murmur lo registra: el importe y de dónde viene.',
    'Say it the way you would to a person: five dollars at Walmart.':
      'Dilo como se lo dirías a una persona: cinco euros en Mercadona.',
    'Say what you spent and Murmur files it: the amount, the merchant and the category.':
      'Di lo que has gastado y Murmur lo registra: el importe, el comercio y la categoría.',
  },
  pt: {
    'Log an expense': 'Registrar um gasto',
    'Log income': 'Registrar uma receita',
    'What did you spend?': 'Quanto você gastou?',
    'What came in?': 'O que você recebeu?',
    'Say it the way you would to a person: two hundred from Acme.':
      'Fale como falaria com uma pessoa: duzentos reais da Acme.',
    'Say what came in and Murmur files it: the amount and where it came from.':
      'Diga o que você recebeu e o Murmur registra: o valor e de onde veio.',
    'Say it the way you would to a person: five dollars at Walmart.':
      'Fale como falaria com uma pessoa: cinco reais no Carrefour.',
    'Say what you spent and Murmur files it: the amount, the merchant and the category.':
      'Diga o que você gastou e o Murmur registra: o valor, o estabelecimento e a categoria.',
  },
}

module.exports = { PHRASES, INTENT_STRINGS, LOCALES: Object.keys(PHRASES) }
