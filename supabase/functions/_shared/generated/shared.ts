// GENERATED FILE - DO NOT EDIT.
//
// Source:    packages/shared/src/edge.ts (the Edge surface of @voice-expense/shared)
// Generator: scripts/build-shared-deno.mjs
// Regenerate: npm run build:shared-deno
//
// Edge Functions import this instead of hand-ported copies, so the server
// runs byte-identical domain logic to the iOS and web apps. Editing this
// file by hand is always wrong: the next regeneration silently discards
// the edit. Change packages/shared and regenerate.
//
// Built from src/edge.ts, not src/index.ts: the apps' entry point exports
// the whole library, and shipping the unused half to a cold-starting Deno
// isolate costs every invocation. To let a function use something new,
// export it from src/edge.ts first.
//
// deno-lint-ignore-file
// @ts-nocheck
// packages/shared/src/i18n/locales/en.json
var en_default = { "ask.title": "Ask Murmur.", "ask.lead": "Grounded in your own transactions. Not general advice, your data, your numbers, a direct answer.", "ask.beta": "Beta", "ask.suggestion_afford": "Can I afford a PS5 this month?", "ask.suggestion_coffee": "Where is my coffee budget going?", "ask.suggestion_unusual": "Why did I spend more than usual last week?", "ask.suggestion_goal": "Help me save $500 by August.", "ask.input_placeholder": "Ask a question about your spending\u2026", "ask.mic_label": "Voice ask", "ask.send_label": "Send question", "ask.privacy_note": "Your data never trains a model", "ask.header_title": "Ask Murmur", "ask.thinking": "Reading your transactions\u2026", "ask.error": "Couldn\u2019t reach Ask Murmur. Try again in a moment.", "ask.retry": "Try again", "ask.followup_placeholder": "Ask a follow-up\u2026", "ask.attribution": "Based on {count} transactions in Murmur. No guesses, no external advice.", "ask.refusal_default": "I can only answer from your own transactions, and that\u2019s outside what I can see.", "ask.action_create_goal": "Create goal", "ask.action_show_category": "Show category", "ask.action_show_transactions": "Show transactions", "ask.action_set_budget": "Set budget", "ask.breakdown_caption": "From your last 3 months", "ask.today_eyebrow": "Today", "ask.entry_lead": "Murmur watches your money. Here's what stands out, or ask anything.", "ask.intent_eyebrow": "I want to\u2026", "ask.intent_budget": "Check my budget", "ask.intent_budget_q": "How am I doing against my budget?", "ask.intent_subs": "Cut a subscription", "ask.intent_subs_q": "Which of my recurring bills could I cut?", "ask.intent_where": "See where my money went", "ask.intent_where_q": "Where did my money go this month?", "ask.intent_plan": "Plan a purchase", "ask.intent_plan_q": "How much can I spend on something new this month without going over?", "ask.composer_placeholder": "Ask anything about your money\u2026", "ask.history": "History", "ask.history_empty": "No conversations yet.", "ask.new_conversation": "New", "ask.delete": "Delete", "ask.busy": "Murmur is busy right now, try again in a moment.", "ask.plus_required": "Ask Murmur is part of Murmur Plus.", "ask.action_open_recurring": "Review recurring", "ask.action_log_expense": "Log an expense", "ask.action_create_rule": "Add a recurring rule", "ask.period_weekly": "weekly", "ask.period_biweekly": "biweekly", "ask.period_monthly": "monthly", "ask.period_quarterly": "quarterly", "ask.period_yearly": "yearly", "ask.insight_unnamed_rule": "Unnamed", "ask.insight_upcoming_title": "{name} {amount} due {date}", "ask.insight_upcoming_detail_income": "With {due} of bills still due, that leaves {left} this month.", "ask.insight_upcoming_detail_noincome": "{due} of bills still due this month.", "ask.insight_upcoming_question": "What's coming up, and what does that leave me this month?", "ask.insight_upcoming_action": "Review recurring", "ask.insight_budget_over_title": "Over budget by {over}", "ask.insight_budget_over_detail": "{days} days left in your {period} budget.", "ask.insight_budget_tight_title": "{left} left for {days} days", "ask.insight_budget_tight_detail": "That's {pace}/day, your usual is {usual}/day.", "ask.insight_budget_ok_title": "On track: {left} left for {days} days", "ask.insight_budget_ok_detail": "{pace}/day keeps you within budget; you usually spend {usual}/day.", "ask.insight_budget_pace_only": "That's {pace}/day to stay within budget.", "ask.insight_budget_question": "How am I doing against my budget?", "ask.insight_budget_action": "Adjust budget", "ask.insight_surge_title": "{category} {amount} so far this month", "ask.insight_surge_detail": "{pct}% over your usual by this point in the month.", "ask.insight_surge_question": "Why is {category} over this month?", "ask.insight_surge_action": "See transactions", "ask.insight_subs_title_one": "{a} takes {total} every month", "ask.insight_subs_title_two": "{a} + {b} take {total} every month", "ask.insight_subs_title_many": "{a}, {b} + {n} more take {total} every month", "ask.insight_subs_detail": "Keep or cut?", "ask.insight_subs_question": "Which of my recurring bills should I keep or cut?", "ask.insight_delta_title": "{category}: biggest change vs last month", "ask.insight_delta_detail_up": "{delta} more than by this point last month.", "ask.insight_delta_detail_down": "{delta} less than by this point last month.", "ask.insight_delta_question": "What changed in {category} compared with last month?", "ask.insight_netflow_title": "Spent {spent} of {income} so far this month", "ask.insight_netflow_detail": "{left} left, {days} days to go.", "ask.insight_netflow_over_title": "Spent {over} more than you earned this month", "ask.insight_netflow_over_detail": "{spent} out, {income} in so far.", "ask.insight_netflow_question": "How am I doing overall this month?", "ask.insight_large_title": "{merchant} {amount} on {date}", "ask.insight_large_detail": "{times}\xD7 your typical purchase.", "ask.insight_large_question": "Tell me about the {merchant} charge.", "ask.insight_large_action": "See transaction", "ask.insight_nodata_title": "Log a few expenses and Murmur starts watching your money", "ask.insight_nodata_detail": "Once there's data, upcoming bills, budget pace and unusual spending show up here.", "ask.insight_nodata_question": "What can you help me with?", "ask.insight_nodata_action": "Log an expense", "ask.continue_eyebrow": "Pick up where you left off", "ask.continue_open": "Continue", "ask.kind_upcoming_bill": "Upcoming bill", "ask.kind_budget_pace": "Budget", "ask.kind_category_surge": "Running high", "ask.kind_subscriptions": "Recurring", "ask.kind_month_delta": "Vs last month", "ask.kind_net_flow": "This month", "ask.kind_large_transaction": "Unusual purchase", "ask.kind_no_data": "Getting started", "notif.billing_issue_title": "Your payment did not go through", "notif.billing_issue_body": "Plus is paused. Updating your payment method brings it straight back.", "notif.billing_issue_body_grace": "Plus keeps working for {days} more days while the store retries.", "notif.trial_ending_title": "Your free trial ends soon", "notif.trial_ending_body": "Plus begins in {days} days. Cancel any time in Settings.", "notif.trial_ending_off_title": "Your trial ends soon", "notif.trial_ending_off_body": "Auto renew is off, so nothing will be charged. Plus stops when the trial ends.", "notif.plus_lapsed_title": "Plus has ended", "notif.plus_lapsed_body": "Everything you logged is still here. Plus features are switched off.", "notif.bill_tomorrow_title": "{name}, {amount}, lands tomorrow", "notif.bill_tomorrow_body_left": "{left} left this month once it clears.", "notif.bill_tomorrow_body": "{due} still due before month end.", "notif.bill_week_title": "{count} bills this week, {amount}", "notif.bill_week_body": "First up: {name}, {amount}.", "notif.bill_missing_title": "{name} has not shown up", "notif.bill_missing_body": "It was due a few days ago. Log it if it went through another way.", "notif.budget_over_title": "Over budget by {over}", "notif.budget_over_body": "{days} days still to go.", "notif.budget_category_over_title": "{category} is over by {over}", "notif.budget_80_title": "{pct}% of your budget, {days} days left", "notif.budget_80_body": "{perDay} a day keeps you inside. {left} left.", "notif.weekly_recap_title": "Last week: {amount}", "notif.weekly_recap_body_top": "{count} entries. {category} was the biggest at {amount}.", "notif.weekly_recap_body": "{count} entries logged.", "notif.winback_14_title": "Two weeks since your last entry", "notif.winback_14_body": "One sentence catches you back up.", "notif.winback_30_title": "Your ledger has been quiet a month", "notif.winback_30_body": "Pick it up with today's first expense.", "notif.winback_60_title": "Still here when you want it", "notif.winback_60_body": "Everything you logged is waiting, exactly as you left it.", "notif.winback_bills_title": "{count} bills are still on your calendar", "notif.winback_bills_body": "{name} at {amount} is next. Want Murmur to keep watch?", "ask.free_quota": "{count} free questions left this month", "ask.free_quota_one": "1 free question left this month", "ask.free_quota_none": "No free questions left this month", "ask.get_plus": "Get Plus" };

// packages/shared/src/i18n/locales/fr.json
var fr_default = { "ask.title": "Ask Murmur.", "ask.lead": "Fond\xE9 sur vos propres transactions. Pas de conseils g\xE9n\xE9riques, vos donn\xE9es, vos chiffres, une r\xE9ponse directe.", "ask.beta": "B\xEAta", "ask.suggestion_afford": "Puis-je me permettre une PS5 ce mois-ci ?", "ask.suggestion_coffee": "O\xF9 part mon budget caf\xE9 ?", "ask.suggestion_unusual": "Pourquoi ai-je d\xE9pens\xE9 plus que d'habitude la semaine derni\xE8re ?", "ask.suggestion_goal": "Aide-moi \xE0 \xE9conomiser 500 \u20AC d'ici ao\xFBt.", "ask.input_placeholder": "Posez une question sur vos d\xE9penses\u2026", "ask.mic_label": "Question vocale", "ask.send_label": "Envoyer la question", "ask.privacy_note": "Vos donn\xE9es n'entra\xEEnent jamais un mod\xE8le", "ask.header_title": "Ask Murmur", "ask.thinking": "Lecture de vos transactions\u2026", "ask.error": "Impossible de joindre Ask Murmur. R\xE9essayez dans un instant.", "ask.retry": "R\xE9essayer", "ask.followup_placeholder": "Question de suivi\u2026", "ask.attribution": "Bas\xE9 sur {count} transactions dans Murmur. Aucune supposition, aucun conseil externe.", "ask.refusal_default": "Je peux uniquement r\xE9pondre \xE0 partir de vos propres transactions, et cela d\xE9passe ce que je peux voir.", "ask.action_create_goal": "Cr\xE9er un objectif", "ask.action_show_category": "Voir la cat\xE9gorie", "ask.action_show_transactions": "Voir les transactions", "ask.action_set_budget": "D\xE9finir un budget", "ask.breakdown_caption": "Sur vos 3 derniers mois", "ask.today_eyebrow": "Aujourd'hui", "ask.entry_lead": "Murmur veille sur votre argent. Voici ce qui ressort, ou posez n'importe quelle question.", "ask.intent_eyebrow": "Je veux\u2026", "ask.intent_budget": "V\xE9rifier mon budget", "ask.intent_budget_q": "O\xF9 en suis-je par rapport \xE0 mon budget ?", "ask.intent_subs": "Couper un abonnement", "ask.intent_subs_q": "Lesquels de mes pr\xE9l\xE8vements r\xE9currents pourrais-je couper ?", "ask.intent_where": "Voir o\xF9 est parti mon argent", "ask.intent_where_q": "O\xF9 est parti mon argent ce mois-ci ?", "ask.intent_plan": "Pr\xE9voir un achat", "ask.intent_plan_q": "Combien puis-je d\xE9penser pour un nouvel achat ce mois-ci sans d\xE9passer ?", "ask.composer_placeholder": "Posez une question sur votre argent\u2026", "ask.history": "Historique", "ask.history_empty": "Aucune conversation pour l'instant.", "ask.new_conversation": "Nouveau", "ask.delete": "Supprimer", "ask.busy": "Murmur est occup\xE9, r\xE9essayez dans un instant.", "ask.plus_required": "Ask Murmur fait partie de Murmur Plus.", "ask.action_open_recurring": "Voir les r\xE9currents", "ask.action_log_expense": "Saisir une d\xE9pense", "ask.action_create_rule": "Ajouter un r\xE9current", "ask.period_weekly": "hebdomadaire", "ask.period_biweekly": "bimensuel", "ask.period_monthly": "mensuel", "ask.period_quarterly": "trimestriel", "ask.period_yearly": "annuel", "ask.insight_unnamed_rule": "Sans nom", "ask.insight_upcoming_title": "{name} {amount} le {date}", "ask.insight_upcoming_detail_income": "Avec {due} de factures encore \xE0 venir, il vous reste {left} ce mois-ci.", "ask.insight_upcoming_detail_noincome": "{due} de factures encore \xE0 venir ce mois-ci.", "ask.insight_upcoming_question": "Qu'est-ce qui arrive, et que me reste-t-il ce mois-ci ?", "ask.insight_upcoming_action": "Voir les r\xE9currents", "ask.insight_budget_over_title": "Budget d\xE9pass\xE9 de {over}", "ask.insight_budget_over_detail": "{days} jours restants sur votre budget {period}.", "ask.insight_budget_tight_title": "{left} restants pour {days} jours", "ask.insight_budget_tight_detail": "Soit {pace}/jour, d'habitude vous d\xE9pensez {usual}/jour.", "ask.insight_budget_ok_title": "Dans les clous : {left} restants pour {days} jours", "ask.insight_budget_ok_detail": "{pace}/jour pour rester dans le budget ; d'habitude vous d\xE9pensez {usual}/jour.", "ask.insight_budget_pace_only": "Soit {pace}/jour pour rester dans le budget.", "ask.insight_budget_question": "O\xF9 en suis-je par rapport \xE0 mon budget ?", "ask.insight_budget_action": "Ajuster le budget", "ask.insight_surge_title": "{category} {amount} depuis le d\xE9but du mois", "ask.insight_surge_detail": "{pct} % au-dessus de votre habitude \xE0 ce stade du mois.", "ask.insight_surge_question": "Pourquoi {category} d\xE9passe-t-il ce mois-ci ?", "ask.insight_surge_action": "Voir les transactions", "ask.insight_subs_title_one": "{a} prend {total} chaque mois", "ask.insight_subs_title_two": "{a} + {b} prennent {total} chaque mois", "ask.insight_subs_title_many": "{a}, {b} + {n} autres prennent {total} chaque mois", "ask.insight_subs_detail": "Garder ou couper ?", "ask.insight_subs_question": "Lesquels de mes pr\xE9l\xE8vements r\xE9currents garder ou couper ?", "ask.insight_delta_title": "{category} : plus gros changement vs le mois dernier", "ask.insight_delta_detail_up": "{delta} de plus qu'\xE0 ce stade le mois dernier.", "ask.insight_delta_detail_down": "{delta} de moins qu'\xE0 ce stade le mois dernier.", "ask.insight_delta_question": "Qu'est-ce qui a chang\xE9 dans {category} par rapport au mois dernier ?", "ask.insight_netflow_title": "{spent} d\xE9pens\xE9s sur {income} ce mois-ci", "ask.insight_netflow_detail": "{left} restants, {days} jours \xE0 tenir.", "ask.insight_netflow_over_title": "{over} d\xE9pens\xE9s de plus que vos revenus ce mois-ci", "ask.insight_netflow_over_detail": "{spent} sortis, {income} entr\xE9s jusqu'ici.", "ask.insight_netflow_question": "Comment je m'en sors globalement ce mois-ci ?", "ask.insight_large_title": "{merchant} {amount} le {date}", "ask.insight_large_detail": "{times}\xD7 votre achat habituel.", "ask.insight_large_question": "Parle-moi de la d\xE9pense {merchant}.", "ask.insight_large_action": "Voir la transaction", "ask.insight_nodata_title": "Saisissez quelques d\xE9penses et Murmur se met \xE0 veiller sur votre argent", "ask.insight_nodata_detail": "D\xE8s qu'il y a des donn\xE9es, les factures \xE0 venir, le rythme du budget et les d\xE9penses inhabituelles apparaissent ici.", "ask.insight_nodata_question": "En quoi peux-tu m'aider ?", "ask.insight_nodata_action": "Saisir une d\xE9pense", "ask.continue_eyebrow": "Reprendre l\xE0 o\xF9 vous en \xE9tiez", "ask.continue_open": "Reprendre", "ask.kind_upcoming_bill": "Facture \xE0 venir", "ask.kind_budget_pace": "Budget", "ask.kind_category_surge": "En hausse", "ask.kind_subscriptions": "R\xE9currents", "ask.kind_month_delta": "Vs le mois dernier", "ask.kind_net_flow": "Ce mois-ci", "ask.kind_large_transaction": "Achat inhabituel", "ask.kind_no_data": "Pour commencer", "notif.billing_issue_title": "Votre paiement n'est pas pass\xE9", "notif.billing_issue_body": "Plus est en pause. Mettez \xE0 jour votre moyen de paiement pour le r\xE9activer.", "notif.billing_issue_body_grace": "Plus continue de fonctionner encore {days} jours pendant que la boutique r\xE9essaie.", "notif.trial_ending_title": "Votre essai gratuit se termine bient\xF4t", "notif.trial_ending_body": "Plus d\xE9marre dans {days} jours. Annulable \xE0 tout moment dans les r\xE9glages.", "notif.trial_ending_off_title": "Votre essai se termine bient\xF4t", "notif.trial_ending_off_body": "Le renouvellement est d\xE9sactiv\xE9, rien ne sera d\xE9bit\xE9. Plus s'arr\xEAte \xE0 la fin de l'essai.", "notif.plus_lapsed_title": "Plus est termin\xE9", "notif.plus_lapsed_body": "Tout ce que vous avez enregistr\xE9 est toujours l\xE0. Les fonctions Plus sont d\xE9sactiv\xE9es.", "notif.bill_tomorrow_title": "{name}, {amount}, tombe demain", "notif.bill_tomorrow_body_left": "Il vous restera {left} ce mois-ci une fois d\xE9bit\xE9.", "notif.bill_tomorrow_body": "{due} encore \xE0 payer d'ici la fin du mois.", "notif.bill_week_title": "{count} factures cette semaine, {amount}", "notif.bill_week_body": "La premi\xE8re : {name}, {amount}.", "notif.bill_missing_title": "{name} n'est pas arriv\xE9", "notif.bill_missing_body": "C'\xE9tait d\xFB il y a quelques jours. Notez-le si le paiement est pass\xE9 autrement.", "notif.budget_over_title": "Budget d\xE9pass\xE9 de {over}", "notif.budget_over_body": "Encore {days} jours \xE0 tenir.", "notif.budget_category_over_title": "{category} d\xE9passe de {over}", "notif.budget_80_title": "{pct} % de votre budget, {days} jours restants", "notif.budget_80_body": "{perDay} par jour pour rester dedans. Il reste {left}.", "notif.weekly_recap_title": "La semaine derni\xE8re : {amount}", "notif.weekly_recap_body_top": "{count} entr\xE9es. {category} en t\xEAte avec {amount}.", "notif.weekly_recap_body": "{count} entr\xE9es enregistr\xE9es.", "notif.winback_14_title": "Deux semaines sans nouvelle entr\xE9e", "notif.winback_14_body": "Une phrase suffit pour vous remettre \xE0 jour.", "notif.winback_30_title": "Votre carnet est calme depuis un mois", "notif.winback_30_body": "Reprenez avec la premi\xE8re d\xE9pense du jour.", "notif.winback_60_title": "Toujours l\xE0 quand vous voulez", "notif.winback_60_body": "Tout ce que vous avez enregistr\xE9 vous attend, tel quel.", "notif.winback_bills_title": "{count} factures sont encore \xE0 votre calendrier", "notif.winback_bills_body": "{name} \xE0 {amount} arrive. Murmur garde un \u0153il dessus ?", "ask.free_quota": "{count} questions gratuites restantes ce mois-ci", "ask.free_quota_one": "1 question gratuite restante ce mois-ci", "ask.free_quota_none": "Plus de questions gratuites ce mois-ci", "ask.get_plus": "Passer \xE0 Plus" };

// packages/shared/src/i18n/locales/es.json
var es_default = { "ask.title": "Ask Murmur.", "ask.lead": "Fundamentado en tus propias transacciones. No es consejo gen\xE9rico, tus datos, tus n\xFAmeros, una respuesta directa.", "ask.beta": "Beta", "ask.suggestion_afford": "\xBFPuedo comprarme una PS5 este mes?", "ask.suggestion_coffee": "\xBFA d\xF3nde se va mi presupuesto de caf\xE9?", "ask.suggestion_unusual": "\xBFPor qu\xE9 gast\xE9 m\xE1s de lo habitual la semana pasada?", "ask.suggestion_goal": "Ay\xFAdame a ahorrar 500 $ para agosto.", "ask.input_placeholder": "Haz una pregunta sobre tus gastos\u2026", "ask.mic_label": "Pregunta por voz", "ask.send_label": "Enviar pregunta", "ask.privacy_note": "Tus datos nunca entrenan un modelo", "ask.header_title": "Ask Murmur", "ask.thinking": "Leyendo tus transacciones\u2026", "ask.error": "No pudimos contactar a Ask Murmur. Int\xE9ntalo de nuevo en un momento.", "ask.retry": "Reintentar", "ask.followup_placeholder": "Pregunta de seguimiento\u2026", "ask.attribution": "Basado en {count} transacciones en Murmur. Sin conjeturas, sin consejos externos.", "ask.refusal_default": "Solo puedo responder a partir de tus propias transacciones, y eso queda fuera de lo que puedo ver.", "ask.action_create_goal": "Crear meta", "ask.action_show_category": "Ver categor\xEDa", "ask.action_show_transactions": "Ver transacciones", "ask.action_set_budget": "Definir presupuesto", "ask.breakdown_caption": "De tus \xFAltimos 3 meses", "ask.today_eyebrow": "Hoy", "ask.entry_lead": "Murmur vigila tu dinero. Esto es lo que destaca, o pregunta lo que quieras.", "ask.intent_eyebrow": "Quiero\u2026", "ask.intent_budget": "Revisar mi presupuesto", "ask.intent_budget_q": "\xBFC\xF3mo voy con mi presupuesto?", "ask.intent_subs": "Cortar una suscripci\xF3n", "ask.intent_subs_q": "\xBFCu\xE1les de mis cargos recurrentes podr\xEDa cortar?", "ask.intent_where": "Ver a d\xF3nde fue mi dinero", "ask.intent_where_q": "\xBFA d\xF3nde fue mi dinero este mes?", "ask.intent_plan": "Planear una compra", "ask.intent_plan_q": "\xBFCu\xE1nto puedo gastar en algo nuevo este mes sin pasarme?", "ask.composer_placeholder": "Pregunta lo que quieras sobre tu dinero\u2026", "ask.history": "Historial", "ask.history_empty": "A\xFAn no hay conversaciones.", "ask.new_conversation": "Nueva", "ask.delete": "Eliminar", "ask.busy": "Murmur est\xE1 ocupado, int\xE9ntalo de nuevo en un momento.", "ask.plus_required": "Ask Murmur forma parte de Murmur Plus.", "ask.action_open_recurring": "Ver recurrentes", "ask.action_log_expense": "Registrar un gasto", "ask.action_create_rule": "A\xF1adir un recurrente", "ask.period_weekly": "semanal", "ask.period_biweekly": "quincenal", "ask.period_monthly": "mensual", "ask.period_quarterly": "trimestral", "ask.period_yearly": "anual", "ask.insight_unnamed_rule": "Sin nombre", "ask.insight_upcoming_title": "{name} {amount} vence el {date}", "ask.insight_upcoming_detail_income": "Con {due} de facturas a\xFAn por pagar, te quedan {left} este mes.", "ask.insight_upcoming_detail_noincome": "{due} de facturas a\xFAn por pagar este mes.", "ask.insight_upcoming_question": "\xBFQu\xE9 viene y qu\xE9 me deja eso este mes?", "ask.insight_upcoming_action": "Ver recurrentes", "ask.insight_budget_over_title": "Presupuesto superado por {over}", "ask.insight_budget_over_detail": "Quedan {days} d\xEDas de tu presupuesto {period}.", "ask.insight_budget_tight_title": "Quedan {left} para {days} d\xEDas", "ask.insight_budget_tight_detail": "Son {pace}/d\xEDa, normalmente gastas {usual}/d\xEDa.", "ask.insight_budget_ok_title": "En camino: quedan {left} para {days} d\xEDas", "ask.insight_budget_ok_detail": "{pace}/d\xEDa te mantiene dentro del presupuesto; normalmente gastas {usual}/d\xEDa.", "ask.insight_budget_pace_only": "Son {pace}/d\xEDa para no pasarte.", "ask.insight_budget_question": "\xBFC\xF3mo voy con mi presupuesto?", "ask.insight_budget_action": "Ajustar presupuesto", "ask.insight_surge_title": "{category} {amount} en lo que va del mes", "ask.insight_surge_detail": "{pct}% por encima de lo habitual a estas alturas del mes.", "ask.insight_surge_question": "\xBFPor qu\xE9 {category} est\xE1 por encima este mes?", "ask.insight_surge_action": "Ver transacciones", "ask.insight_subs_title_one": "{a} se lleva {total} cada mes", "ask.insight_subs_title_two": "{a} + {b} se llevan {total} cada mes", "ask.insight_subs_title_many": "{a}, {b} + {n} m\xE1s se llevan {total} cada mes", "ask.insight_subs_detail": "\xBFMantener o cortar?", "ask.insight_subs_question": "\xBFCu\xE1les de mis cargos recurrentes deber\xEDa mantener o cortar?", "ask.insight_delta_title": "{category}: el mayor cambio vs el mes pasado", "ask.insight_delta_detail_up": "{delta} m\xE1s que a estas alturas el mes pasado.", "ask.insight_delta_detail_down": "{delta} menos que a estas alturas el mes pasado.", "ask.insight_delta_question": "\xBFQu\xE9 cambi\xF3 en {category} respecto al mes pasado?", "ask.insight_netflow_title": "Gastados {spent} de {income} en lo que va del mes", "ask.insight_netflow_detail": "Quedan {left}, faltan {days} d\xEDas.", "ask.insight_netflow_over_title": "Gastaste {over} m\xE1s de lo que ingresaste este mes", "ask.insight_netflow_over_detail": "{spent} salieron, {income} entraron hasta ahora.", "ask.insight_netflow_question": "\xBFC\xF3mo voy en general este mes?", "ask.insight_large_title": "{merchant} {amount} el {date}", "ask.insight_large_detail": "{times}\xD7 tu compra habitual.", "ask.insight_large_question": "Cu\xE9ntame sobre el cargo de {merchant}.", "ask.insight_large_action": "Ver transacci\xF3n", "ask.insight_nodata_title": "Registra unos gastos y Murmur empieza a vigilar tu dinero", "ask.insight_nodata_detail": "Cuando haya datos, aqu\xED ver\xE1s facturas pr\xF3ximas, ritmo del presupuesto y gastos inusuales.", "ask.insight_nodata_question": "\xBFEn qu\xE9 puedes ayudarme?", "ask.insight_nodata_action": "Registrar un gasto", "ask.continue_eyebrow": "Retoma donde lo dejaste", "ask.continue_open": "Continuar", "ask.kind_upcoming_bill": "Factura pr\xF3xima", "ask.kind_budget_pace": "Presupuesto", "ask.kind_category_surge": "Al alza", "ask.kind_subscriptions": "Recurrentes", "ask.kind_month_delta": "Vs el mes pasado", "ask.kind_net_flow": "Este mes", "ask.kind_large_transaction": "Compra inusual", "ask.kind_no_data": "Para empezar", "notif.billing_issue_title": "Tu pago no se ha completado", "notif.billing_issue_body": "Plus est\xE1 en pausa. Actualiza tu m\xE9todo de pago para recuperarlo.", "notif.billing_issue_body_grace": "Plus sigue activo {days} d\xEDas m\xE1s mientras la tienda lo reintenta.", "notif.trial_ending_title": "Tu prueba gratuita termina pronto", "notif.trial_ending_body": "Plus empieza en {days} d\xEDas. Puedes cancelar cuando quieras en Ajustes.", "notif.trial_ending_off_title": "Tu prueba termina pronto", "notif.trial_ending_off_body": "La renovaci\xF3n est\xE1 desactivada, no se cobrar\xE1 nada. Plus se detiene al terminar la prueba.", "notif.plus_lapsed_title": "Plus ha terminado", "notif.plus_lapsed_body": "Todo lo que registraste sigue aqu\xED. Las funciones Plus est\xE1n desactivadas.", "notif.bill_tomorrow_title": "{name}, {amount}, se cobra ma\xF1ana", "notif.bill_tomorrow_body_left": "Te quedar\xE1n {left} este mes cuando se cobre.", "notif.bill_tomorrow_body": "{due} pendientes hasta fin de mes.", "notif.bill_week_title": "{count} recibos esta semana, {amount}", "notif.bill_week_body": "El primero: {name}, {amount}.", "notif.bill_missing_title": "{name} no ha aparecido", "notif.bill_missing_body": "Venc\xEDa hace unos d\xEDas. Reg\xEDstralo si lo pagaste de otra forma.", "notif.budget_over_title": "Te pasaste del presupuesto por {over}", "notif.budget_over_body": "Quedan {days} d\xEDas.", "notif.budget_category_over_title": "{category} se pasa por {over}", "notif.budget_80_title": "{pct} % de tu presupuesto, {days} d\xEDas restantes", "notif.budget_80_body": "{perDay} al d\xEDa para no pasarte. Quedan {left}.", "notif.weekly_recap_title": "La semana pasada: {amount}", "notif.weekly_recap_body_top": "{count} entradas. {category} fue lo m\xE1s alto con {amount}.", "notif.weekly_recap_body": "{count} entradas registradas.", "notif.winback_14_title": "Dos semanas sin registrar nada", "notif.winback_14_body": "Una frase y te pones al d\xEDa.", "notif.winback_30_title": "Tu registro lleva un mes en silencio", "notif.winback_30_body": "Ret\xF3malo con el primer gasto de hoy.", "notif.winback_60_title": "Aqu\xED seguimos cuando quieras", "notif.winback_60_body": "Todo lo que registraste te espera, tal cual.", "notif.winback_bills_title": "{count} recibos siguen en tu calendario", "notif.winback_bills_body": "{name} de {amount} es el pr\xF3ximo. \xBFMurmur los vigila?", "ask.free_quota": "Te quedan {count} preguntas gratis este mes", "ask.free_quota_one": "Te queda 1 pregunta gratis este mes", "ask.free_quota_none": "No quedan preguntas gratis este mes", "ask.get_plus": "Obtener Plus" };

// packages/shared/src/i18n/locales/pt.json
var pt_default = { "ask.title": "Ask Murmur.", "ask.lead": "Fundamentado nas suas pr\xF3prias transa\xE7\xF5es. N\xE3o \xE9 conselho gen\xE9rico, seus dados, seus n\xFAmeros, uma resposta direta.", "ask.beta": "Beta", "ask.suggestion_afford": "Posso comprar um PS5 este m\xEAs?", "ask.suggestion_coffee": "Para onde est\xE1 indo meu or\xE7amento de caf\xE9?", "ask.suggestion_unusual": "Por que gastei mais que o normal semana passada?", "ask.suggestion_goal": "Me ajude a economizar R$500 at\xE9 agosto.", "ask.input_placeholder": "Pergunte algo sobre seus gastos\u2026", "ask.mic_label": "Pergunta por voz", "ask.send_label": "Enviar pergunta", "ask.privacy_note": "Seus dados nunca treinam um modelo", "ask.header_title": "Ask Murmur", "ask.thinking": "Lendo suas transa\xE7\xF5es\u2026", "ask.error": "N\xE3o conseguimos falar com Ask Murmur. Tente novamente em instantes.", "ask.retry": "Tentar de novo", "ask.followup_placeholder": "Pergunta de acompanhamento\u2026", "ask.attribution": "Baseado em {count} transa\xE7\xF5es no Murmur. Sem palpites, sem conselhos externos.", "ask.refusal_default": "S\xF3 consigo responder a partir das suas pr\xF3prias transa\xE7\xF5es, e isso est\xE1 fora do que posso ver.", "ask.action_create_goal": "Criar meta", "ask.action_show_category": "Ver categoria", "ask.action_show_transactions": "Ver transa\xE7\xF5es", "ask.action_set_budget": "Definir or\xE7amento", "ask.breakdown_caption": "Dos seus \xFAltimos 3 meses", "ask.today_eyebrow": "Hoje", "ask.entry_lead": "O Murmur acompanha o seu dinheiro. Isto \xE9 o que se destaca, ou pergunte o que quiser.", "ask.intent_eyebrow": "Quero\u2026", "ask.intent_budget": "Ver o meu or\xE7amento", "ask.intent_budget_q": "Como estou em rela\xE7\xE3o ao meu or\xE7amento?", "ask.intent_subs": "Cortar uma assinatura", "ask.intent_subs_q": "Quais das minhas cobran\xE7as recorrentes eu poderia cortar?", "ask.intent_where": "Ver para onde foi o dinheiro", "ask.intent_where_q": "Para onde foi o meu dinheiro este m\xEAs?", "ask.intent_plan": "Planejar uma compra", "ask.intent_plan_q": "Quanto posso gastar em algo novo este m\xEAs sem estourar?", "ask.composer_placeholder": "Pergunte qualquer coisa sobre o seu dinheiro\u2026", "ask.history": "Hist\xF3rico", "ask.history_empty": "Ainda n\xE3o h\xE1 conversas.", "ask.new_conversation": "Nova", "ask.delete": "Excluir", "ask.busy": "O Murmur est\xE1 ocupado, tente de novo em instantes.", "ask.plus_required": "O Ask Murmur faz parte do Murmur Plus.", "ask.action_open_recurring": "Ver recorrentes", "ask.action_log_expense": "Registrar um gasto", "ask.action_create_rule": "Adicionar recorrente", "ask.period_weekly": "semanal", "ask.period_biweekly": "quinzenal", "ask.period_monthly": "mensal", "ask.period_quarterly": "trimestral", "ask.period_yearly": "anual", "ask.insight_unnamed_rule": "Sem nome", "ask.insight_upcoming_title": "{name} {amount} vence em {date}", "ask.insight_upcoming_detail_income": "Com {due} de contas ainda por pagar, sobram {left} este m\xEAs.", "ask.insight_upcoming_detail_noincome": "{due} de contas ainda por pagar este m\xEAs.", "ask.insight_upcoming_question": "O que vem por a\xED e o que isso me deixa este m\xEAs?", "ask.insight_upcoming_action": "Ver recorrentes", "ask.insight_budget_over_title": "Or\xE7amento estourado em {over}", "ask.insight_budget_over_detail": "Faltam {days} dias no seu or\xE7amento {period}.", "ask.insight_budget_tight_title": "Restam {left} para {days} dias", "ask.insight_budget_tight_detail": "S\xE3o {pace}/dia, normalmente voc\xEA gasta {usual}/dia.", "ask.insight_budget_ok_title": "No caminho: restam {left} para {days} dias", "ask.insight_budget_ok_detail": "{pace}/dia mant\xE9m voc\xEA dentro do or\xE7amento; normalmente voc\xEA gasta {usual}/dia.", "ask.insight_budget_pace_only": "S\xE3o {pace}/dia para ficar dentro do or\xE7amento.", "ask.insight_budget_question": "Como estou em rela\xE7\xE3o ao meu or\xE7amento?", "ask.insight_budget_action": "Ajustar or\xE7amento", "ask.insight_surge_title": "{category} {amount} at\xE9 agora este m\xEAs", "ask.insight_surge_detail": "{pct}% acima do habitual a esta altura do m\xEAs.", "ask.insight_surge_question": "Por que {category} est\xE1 acima este m\xEAs?", "ask.insight_surge_action": "Ver transa\xE7\xF5es", "ask.insight_subs_title_one": "{a} leva {total} todo m\xEAs", "ask.insight_subs_title_two": "{a} + {b} levam {total} todo m\xEAs", "ask.insight_subs_title_many": "{a}, {b} + {n} outros levam {total} todo m\xEAs", "ask.insight_subs_detail": "Manter ou cortar?", "ask.insight_subs_question": "Quais das minhas cobran\xE7as recorrentes devo manter ou cortar?", "ask.insight_delta_title": "{category}: maior mudan\xE7a vs o m\xEAs passado", "ask.insight_delta_detail_up": "{delta} a mais do que a esta altura no m\xEAs passado.", "ask.insight_delta_detail_down": "{delta} a menos do que a esta altura no m\xEAs passado.", "ask.insight_delta_question": "O que mudou em {category} em rela\xE7\xE3o ao m\xEAs passado?", "ask.insight_netflow_title": "Gastos {spent} de {income} at\xE9 agora este m\xEAs", "ask.insight_netflow_detail": "Restam {left}, faltam {days} dias.", "ask.insight_netflow_over_title": "Voc\xEA gastou {over} a mais do que ganhou este m\xEAs", "ask.insight_netflow_over_detail": "{spent} sa\xEDram, {income} entraram at\xE9 agora.", "ask.insight_netflow_question": "Como estou no geral este m\xEAs?", "ask.insight_large_title": "{merchant} {amount} em {date}", "ask.insight_large_detail": "{times}\xD7 a sua compra habitual.", "ask.insight_large_question": "Me conte sobre a cobran\xE7a de {merchant}.", "ask.insight_large_action": "Ver transa\xE7\xE3o", "ask.insight_nodata_title": "Registre alguns gastos e o Murmur come\xE7a a acompanhar o seu dinheiro", "ask.insight_nodata_detail": "Assim que houver dados, contas a vencer, ritmo do or\xE7amento e gastos incomuns aparecem aqui.", "ask.insight_nodata_question": "Com o que voc\xEA pode me ajudar?", "ask.insight_nodata_action": "Registrar um gasto", "ask.continue_eyebrow": "Retome de onde parou", "ask.continue_open": "Continuar", "ask.kind_upcoming_bill": "Conta a vencer", "ask.kind_budget_pace": "Or\xE7amento", "ask.kind_category_surge": "Em alta", "ask.kind_subscriptions": "Recorrentes", "ask.kind_month_delta": "Vs o m\xEAs passado", "ask.kind_net_flow": "Este m\xEAs", "ask.kind_large_transaction": "Compra incomum", "ask.kind_no_data": "Para come\xE7ar", "notif.billing_issue_title": "Seu pagamento n\xE3o foi aprovado", "notif.billing_issue_body": "O Plus est\xE1 pausado. Atualize sua forma de pagamento para reativ\xE1-lo.", "notif.billing_issue_body_grace": "O Plus continua funcionando por mais {days} dias enquanto a loja tenta de novo.", "notif.trial_ending_title": "Seu teste gr\xE1tis termina em breve", "notif.trial_ending_body": "O Plus come\xE7a em {days} dias. D\xE1 para cancelar quando quiser nos ajustes.", "notif.trial_ending_off_title": "Seu teste termina em breve", "notif.trial_ending_off_body": "A renova\xE7\xE3o est\xE1 desligada, nada ser\xE1 cobrado. O Plus para no fim do teste.", "notif.plus_lapsed_title": "O Plus terminou", "notif.plus_lapsed_body": "Tudo o que voc\xEA registrou continua aqui. Os recursos Plus est\xE3o desligados.", "notif.bill_tomorrow_title": "{name}, {amount}, cai amanh\xE3", "notif.bill_tomorrow_body_left": "V\xE3o sobrar {left} neste m\xEAs depois disso.", "notif.bill_tomorrow_body": "{due} ainda a pagar at\xE9 o fim do m\xEAs.", "notif.bill_week_title": "{count} contas nesta semana, {amount}", "notif.bill_week_body": "A primeira: {name}, {amount}.", "notif.bill_missing_title": "{name} n\xE3o apareceu", "notif.bill_missing_body": "Venceu h\xE1 alguns dias. Registre se voc\xEA pagou de outro jeito.", "notif.budget_over_title": "Passou do or\xE7amento em {over}", "notif.budget_over_body": "Ainda faltam {days} dias.", "notif.budget_category_over_title": "{category} passou em {over}", "notif.budget_80_title": "{pct}% do seu or\xE7amento, {days} dias restantes", "notif.budget_80_body": "{perDay} por dia para n\xE3o estourar. Restam {left}.", "notif.weekly_recap_title": "Semana passada: {amount}", "notif.weekly_recap_body_top": "{count} lan\xE7amentos. {category} liderou com {amount}.", "notif.weekly_recap_body": "{count} lan\xE7amentos registrados.", "notif.winback_14_title": "Duas semanas sem registrar nada", "notif.winback_14_body": "Uma frase j\xE1 te coloca em dia.", "notif.winback_30_title": "Seu registro est\xE1 quieto h\xE1 um m\xEAs", "notif.winback_30_body": "Retome com o primeiro gasto de hoje.", "notif.winback_60_title": "Seguimos aqui quando voc\xEA quiser", "notif.winback_60_body": "Tudo o que voc\xEA registrou continua esperando, do jeito que ficou.", "notif.winback_bills_title": "{count} contas ainda est\xE3o no seu calend\xE1rio", "notif.winback_bills_body": "{name} de {amount} \xE9 a pr\xF3xima. O Murmur fica de olho?", "ask.free_quota": "{count} perguntas gr\xE1tis restantes este m\xEAs", "ask.free_quota_one": "1 pergunta gr\xE1tis restante este m\xEAs", "ask.free_quota_none": "Sem perguntas gr\xE1tis este m\xEAs", "ask.get_plus": "Obter o Plus" };

// packages/shared/src/i18n/index.ts
var locales = { en: en_default, fr: fr_default, es: es_default, pt: pt_default };
function t(key, locale = "en") {
  const strings = locales[locale];
  return strings[key] ?? locales["en"][key] ?? key;
}

// packages/shared/src/utils/period.ts
var MS_PER_DAY = 864e5;
function pad2(n) {
  return String(n).padStart(2, "0");
}
function pad4(n) {
  return String(n).padStart(4, "0");
}
function toIso(epochMs) {
  return new Date(epochMs).toISOString();
}
function normalizeHour(h) {
  return h === 24 ? 0 : h;
}
var PARTS_FORMATTER_CACHE = /* @__PURE__ */ new Map();
function partsFormatter(tz) {
  let dtf = PARTS_FORMATTER_CACHE.get(tz);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    });
    PARTS_FORMATTER_CACHE.set(tz, dtf);
  }
  return dtf;
}
function civilFieldsAt(epochMs, tz) {
  const dtf = partsFormatter(tz);
  if (typeof dtf.formatToParts === "function") {
    const parts = dtf.formatToParts(new Date(epochMs));
    const out = {};
    for (const p of parts) {
      if (p.type !== "literal") out[p.type] = Number(p.value);
    }
    return out;
  }
  const m = dtf.format(new Date(epochMs)).match(/(\d{2})\/(\d{2})\/(\d{4}),?\s+(\d{2}):(\d{2}):(\d{2})/u);
  if (!m) throw new Error(`period.ts: unparseable DateTimeFormat output for tz "${tz}"`);
  return { month: +m[1], day: +m[2], year: +m[3], hour: +m[4], minute: +m[5], second: +m[6] };
}
function tzOffsetMsAt(epochMs, tz) {
  const fields = civilFieldsAt(epochMs, tz);
  const get = (type) => {
    const found = fields[type];
    if (found === void 0 || Number.isNaN(found)) throw new Error(`period.ts: Intl did not return a "${type}" part for tz "${tz}"`);
    return found;
  };
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    normalizeHour(get("hour")),
    get("minute"),
    get("second")
  );
  return asIfUtc - epochMs;
}
function zonedTimeToUtcMs(y, month0, d, h, min, s, ms, tz) {
  const guess = Date.UTC(y, month0, d, h, min, s, ms);
  const offset = tzOffsetMsAt(guess, tz);
  return guess - tzOffsetMsAt(guess - offset, tz);
}
function civilDayNumber(y, month0, d) {
  return Math.floor(Date.UTC(y, month0, d) / MS_PER_DAY);
}
function civilFromDayNumber(dayNumber) {
  const dt = new Date(dayNumber * MS_PER_DAY);
  return { y: dt.getUTCFullYear(), month0: dt.getUTCMonth(), d: dt.getUTCDate() };
}
function civilWeekdayMonday0(y, month0, d) {
  const sundayIndexed = new Date(Date.UTC(y, month0, d)).getUTCDay();
  return (sundayIndexed + 6) % 7;
}
function parseMonthIso(monthIsoStr) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthIsoStr);
  if (!match) throw new Error(`period.ts: "${monthIsoStr}" is not a "YYYY-MM" month`);
  return { y: Number(match[1]), month0: Number(match[2]) - 1 };
}
function parseLocalDay(dayIsoStr) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayIsoStr);
  if (!match) throw new Error(`period.ts: "${dayIsoStr}" is not a "YYYY-MM-DD" day`);
  return { y: Number(match[1]), month0: Number(match[2]) - 1, d: Number(match[3]) };
}
function civilDayBounds(dayIsoStr, tz, lengthDays) {
  const { y, month0, d } = parseLocalDay(dayIsoStr);
  const startDayNum = civilDayNumber(y, month0, d);
  const start = zonedTimeToUtcMs(y, month0, d, 0, 0, 0, 0, tz);
  const end = civilFromDayNumber(startDayNum + lengthDays);
  const endExclusive = zonedTimeToUtcMs(end.y, end.month0, end.d, 0, 0, 0, 0, tz);
  return { start: toIso(start), endExclusive: toIso(endExclusive) };
}
function localParts(instantIso, tz) {
  const epochMs = Date.parse(instantIso);
  if (Number.isNaN(epochMs)) {
    throw new Error(`period.ts: "${instantIso}" is not a parseable ISO instant`);
  }
  const fields = civilFieldsAt(epochMs, tz);
  const get = (type) => Number(fields[type]);
  const y = get("year");
  const m = get("month");
  const d = get("day");
  return {
    y,
    m,
    d,
    weekdayIndex: civilWeekdayMonday0(y, m - 1, d),
    hour: normalizeHour(get("hour")),
    minute: get("minute"),
    second: get("second")
  };
}
function localDay(instantIso, tz) {
  const { y, m, d } = localParts(instantIso, tz);
  return `${pad4(y)}-${pad2(m)}-${pad2(d)}`;
}
function monthIso(instantIso, tz) {
  const { y, m } = localParts(instantIso, tz);
  return `${pad4(y)}-${pad2(m)}`;
}
function monthBounds(monthIsoStr, tz) {
  const { y, month0 } = parseMonthIso(monthIsoStr);
  const start = zonedTimeToUtcMs(y, month0, 1, 0, 0, 0, 0, tz);
  const endExclusive = zonedTimeToUtcMs(y, month0 + 1, 1, 0, 0, 0, 0, tz);
  return { start: toIso(start), endExclusive: toIso(endExclusive) };
}
function weekStart(instantIso, tz) {
  const parts = localParts(instantIso, tz);
  const dayNum = civilDayNumber(parts.y, parts.m - 1, parts.d);
  const monday = civilFromDayNumber(dayNum - parts.weekdayIndex);
  return `${pad4(monday.y)}-${pad2(monday.month0 + 1)}-${pad2(monday.d)}`;
}
function weekBounds(instantIso, tz) {
  return civilDayBounds(weekStart(instantIso, tz), tz, 7);
}
function quarterBounds(instantIso, tz) {
  const parts = localParts(instantIso, tz);
  const quarterStartMonth0 = Math.floor((parts.m - 1) / 3) * 3;
  const start = zonedTimeToUtcMs(parts.y, quarterStartMonth0, 1, 0, 0, 0, 0, tz);
  const endExclusive = zonedTimeToUtcMs(parts.y, quarterStartMonth0 + 3, 1, 0, 0, 0, 0, tz);
  return { start: toIso(start), endExclusive: toIso(endExclusive) };
}
function yearBounds(instantIso, tz) {
  const parts = localParts(instantIso, tz);
  const start = zonedTimeToUtcMs(parts.y, 0, 1, 0, 0, 0, 0, tz);
  const endExclusive = zonedTimeToUtcMs(parts.y + 1, 0, 1, 0, 0, 0, 0, tz);
  return { start: toIso(start), endExclusive: toIso(endExclusive) };
}
function cyclicDayBounds(atInstantIso, tz, anchorIso, periodDays) {
  const at = localParts(atInstantIso, tz);
  const anchor = localParts(anchorIso, tz);
  const atDayNum = civilDayNumber(at.y, at.m - 1, at.d);
  const anchorDayNum = civilDayNumber(anchor.y, anchor.m - 1, anchor.d);
  const cycleIndex = Math.floor((atDayNum - anchorDayNum) / periodDays);
  const cycleStartDayNum = anchorDayNum + cycleIndex * periodDays;
  const startCivil = civilFromDayNumber(cycleStartDayNum);
  const endCivil = civilFromDayNumber(cycleStartDayNum + periodDays);
  const start = zonedTimeToUtcMs(startCivil.y, startCivil.month0, startCivil.d, 0, 0, 0, 0, tz);
  const endExclusive = zonedTimeToUtcMs(endCivil.y, endCivil.month0, endCivil.d, 0, 0, 0, 0, tz);
  return { start: toIso(start), endExclusive: toIso(endExclusive) };
}
function periodBounds(period, atInstantIso, tz, anchor) {
  switch (period) {
    case "weekly":
      return weekBounds(atInstantIso, tz);
    case "biweekly":
      if (!anchor) {
        throw new Error(
          `period.ts: periodBounds('biweekly', ...) requires an anchor instant (e.g. the budget's starts_at) to fix the 14-day cycle's phase \u2014 a floating "last 14 days" window is not a stable definition of a fortnight.`
        );
      }
      return cyclicDayBounds(atInstantIso, tz, anchor, 14);
    case "monthly":
      return monthBounds(monthIso(atInstantIso, tz), tz);
    case "quarterly":
      return quarterBounds(atInstantIso, tz);
    case "yearly":
      return yearBounds(atInstantIso, tz);
    default: {
      const exhaustive = period;
      throw new Error(`period.ts: periodBounds received an unknown period "${String(exhaustive)}"`);
    }
  }
}
function addMonthsClamped(y, m, d, deltaMonths) {
  const target0 = m - 1 + deltaMonths;
  const targetY = y + Math.floor(target0 / 12);
  const targetMonth0 = (target0 % 12 + 12) % 12;
  const daysInTargetMonth = new Date(Date.UTC(targetY, targetMonth0 + 1, 0)).getUTCDate();
  return { y: targetY, m: targetMonth0 + 1, d: Math.min(d, daysInTargetMonth) };
}
function addDays(y, m, d, deltaDays) {
  const { y: ry, month0, d: rd } = civilFromDayNumber(civilDayNumber(y, m - 1, d) + deltaDays);
  return { y: ry, m: month0 + 1, d: rd };
}
function daysBetween(y1, m1, d1, y2, m2, d2) {
  return civilDayNumber(y2, m2 - 1, d2) - civilDayNumber(y1, m1 - 1, d1);
}
function civilDateTimeToInstant(y, m, d, h, minute, s, tz) {
  return toIso(zonedTimeToUtcMs(y, m - 1, d, h, minute, s, 0, tz));
}

// packages/shared/src/domain/recurrence.ts
function instantMs(iso) {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new Error(`recurrence.ts: "${iso}" is not a parseable ISO instant`);
  return ms;
}
function parseAnchorTime(raw) {
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (!match) throw new Error(`recurrence.ts: "${raw}" is not a parseable "HH:MM[:SS]" anchor_time`);
  return { hour: Number(match[1]), minute: Number(match[2]), second: Number(match[3] ?? 0) };
}
function resolveAnchor(rule, tz) {
  const start = localParts(rule.starts_at, tz);
  const day = rule.anchor_day ?? start.d;
  const weekday = rule.anchor_weekday ?? start.weekdayIndex + 1;
  if (rule.anchor_time) {
    const { hour, minute, second } = parseAnchorTime(rule.anchor_time);
    return { day, weekday, hour, minute, second };
  }
  return { day, weekday, hour: start.hour, minute: start.minute, second: start.second };
}
function normalizedInterval(rule) {
  const n = Math.trunc(rule.interval);
  return Number.isFinite(n) && n > 0 ? n : 1;
}
function cadenceStep(rule) {
  const interval = normalizedInterval(rule);
  switch (rule.frequency) {
    case "daily":
      return { unit: "days", n: interval };
    case "weekly":
      return { unit: "days", n: 7 * interval };
    case "biweekly":
      return { unit: "days", n: 14 * interval };
    case "monthly":
      return { unit: "months", n: interval };
    case "quarterly":
      return { unit: "months", n: 3 * interval };
    case "yearly":
      return { unit: "months", n: 12 * interval };
    default: {
      const exhaustive = rule.frequency;
      throw new Error(`recurrence.ts: unknown frequency "${String(exhaustive)}"`);
    }
  }
}
function buildOccurrence(rule, instant, tz) {
  if (rule.ends_at && instantMs(instant) > instantMs(rule.ends_at)) return null;
  return { instant, occurrenceDate: localDay(instant, tz) };
}
function nextOccurrence(rule, afterInstant, tz) {
  if (afterInstant == null) {
    return buildOccurrence(rule, rule.starts_at, tz);
  }
  const anchor = resolveAnchor(rule, tz);
  const after = localParts(afterInstant, tz);
  const step = cadenceStep(rule);
  const target = step.unit === "days" ? addDays(after.y, after.m, after.d, step.n) : addMonthsClamped(after.y, after.m, anchor.day, step.n);
  const instant = civilDateTimeToInstant(
    target.y,
    target.m,
    target.d,
    anchor.hour,
    anchor.minute,
    anchor.second,
    tz
  );
  return buildOccurrence(rule, instant, tz);
}
function firstOccurrenceOnOrAfter(rule, atInstant, tz) {
  if (instantMs(rule.starts_at) >= instantMs(atInstant)) {
    return buildOccurrence(rule, rule.starts_at, tz);
  }
  const anchor = resolveAnchor(rule, tz);
  const start = localParts(rule.starts_at, tz);
  const at = localParts(atInstant, tz);
  const step = cadenceStep(rule);
  const elapsed = step.unit === "days" ? daysBetween(start.y, start.m, start.d, at.y, at.m, at.d) : (at.y - start.y) * 12 + (at.m - start.m);
  const estimateCycles = Math.max(0, Math.floor(elapsed / step.n));
  const occurrenceAtCycle = (cycles) => {
    const target = step.unit === "days" ? addDays(start.y, start.m, start.d, cycles * step.n) : addMonthsClamped(start.y, start.m, anchor.day, cycles * step.n);
    const instant = civilDateTimeToInstant(
      target.y,
      target.m,
      target.d,
      anchor.hour,
      anchor.minute,
      anchor.second,
      tz
    );
    return buildOccurrence(rule, instant, tz);
  };
  for (let cycles = estimateCycles; cycles <= estimateCycles + 2; cycles++) {
    const occ = occurrenceAtCycle(cycles);
    if (!occ) return null;
    if (instantMs(occ.instant) >= instantMs(atInstant)) return occ;
  }
  return null;
}
function occurrencesInWindow(rule, startInstant, endExclusiveInstant, tz, opts = {}) {
  const limit = opts.limit ?? 1e4;
  const out = [];
  let cursor = firstOccurrenceOnOrAfter(rule, startInstant, tz);
  let iterations = 0;
  while (cursor && instantMs(cursor.instant) < instantMs(endExclusiveInstant) && iterations < limit) {
    out.push(cursor);
    cursor = nextOccurrence(rule, cursor.instant, tz);
    iterations++;
  }
  return out;
}
function occurrencesDue(rule, nowInstant, tz, limit = 500) {
  const out = [];
  let cursor = nextOccurrence(rule, rule.last_generated, tz);
  let iterations = 0;
  while (cursor && instantMs(cursor.instant) <= instantMs(nowInstant) && iterations < limit) {
    out.push(cursor);
    cursor = nextOccurrence(rule, cursor.instant, tz);
    iterations++;
  }
  return out;
}
function monthlyEquivalent(rule) {
  const interval = normalizedInterval(rule);
  switch (rule.frequency) {
    // Exact calendar ratios, not the 30 / 4.33 / 2.17 shortcuts this used
    // to ship: a $2,500 biweekly paycheck is $5,416.67/mo (26 ÷ 12), not
    // the $5,425 the rounded factor produced on the Recurring hero.
    case "daily":
      return rule.amount * (365.25 / 12) / interval;
    case "weekly":
      return rule.amount * (52 / 12) / interval;
    case "biweekly":
      return rule.amount * (26 / 12) / interval;
    case "monthly":
      return rule.amount / interval;
    case "quarterly":
      return rule.amount / (3 * interval);
    case "yearly":
      return rule.amount / (12 * interval);
    default: {
      const exhaustive = rule.frequency;
      throw new Error(`recurrence.ts: unknown frequency "${String(exhaustive)}"`);
    }
  }
}

// packages/shared/src/utils/currency.ts
function roundCents(amount) {
  const sign = amount < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(amount) * 100) / 100;
}

// packages/shared/src/domain/money.ts
var DEFAULT_TRANSFER_CATEGORY_NAMES = /* @__PURE__ */ new Set([
  "Savings & Investing"
]);
function resolveCategoryKind(categoryName, explicitKind) {
  if (explicitKind != null) return explicitKind;
  if (categoryName != null && DEFAULT_TRANSFER_CATEGORY_NAMES.has(categoryName)) {
    return "transfer";
  }
  return null;
}
function classifyFlow(txn, categoryKind) {
  if (categoryKind === "transfer") return "transfer";
  if (categoryKind === "income") return "income";
  return txn.direction === "credit" ? "income" : "expense";
}
function isSpend(txn, categoryKind) {
  return classifyFlow(txn, categoryKind) === "expense";
}

// packages/shared/src/domain/budget.ts
function resolveBudgetAnchor(startsAt, tz) {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startsAt);
  if (!dateOnly) return startsAt;
  return civilDateTimeToInstant(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]), 0, 0, 0, tz);
}
function budgetStatus(budget, txns, rules, tz, atInstantIso = (/* @__PURE__ */ new Date()).toISOString()) {
  const anchor = resolveBudgetAnchor(budget.starts_at, tz);
  const window = periodBounds(budget.period, atInstantIso, tz, anchor);
  const inWindow = txns.filter(
    (t2) => t2.transacted_at >= window.start && t2.transacted_at < window.endExclusive
  );
  const scoped = budget.category_id == null ? inWindow : inWindow.filter((t2) => t2.category_id === budget.category_id);
  let spentCents = 0;
  let committedFromTxnsCents = 0;
  let pendingCount = 0;
  const postedCountByRule = /* @__PURE__ */ new Map();
  for (const t2 of scoped) {
    if (t2.recurring_rule_id) {
      postedCountByRule.set(t2.recurring_rule_id, (postedCountByRule.get(t2.recurring_rule_id) ?? 0) + 1);
    }
    const categoryKind = resolveCategoryKind(t2.category_name, t2.category_kind);
    if (!isSpend(t2, categoryKind)) continue;
    if (t2.amount_in_profile_currency == null) {
      pendingCount++;
      continue;
    }
    const cents = Math.round(t2.amount_in_profile_currency * 100);
    if (t2.transacted_at > atInstantIso) {
      committedFromTxnsCents += cents;
    } else {
      spentCents += cents;
    }
  }
  let committedFromRulesCents = 0;
  for (const r of rules) {
    if (!r.is_active || r.direction !== "debit") continue;
    if (budget.category_id != null && r.category_id !== budget.category_id) continue;
    const perOccurrence = r.amount_in_profile_currency ?? (r.currency_code === budget.currency_code ? r.amount : null);
    if (perOccurrence == null) continue;
    const due = occurrencesInWindow(r, window.start, window.endExclusive, tz);
    if (due.length === 0) continue;
    const posted = postedCountByRule.get(r.id) ?? 0;
    const unposted = Math.max(0, due.length - posted);
    if (unposted === 0) continue;
    committedFromRulesCents += Math.round(perOccurrence * 100) * unposted;
  }
  const spent = roundCents(spentCents / 100);
  const committed = roundCents((committedFromTxnsCents + committedFromRulesCents) / 100);
  const remaining = roundCents(budget.amount - spent - committed);
  const pct = budget.amount > 0 ? (spent + committed) / budget.amount : 0;
  return { spent, committed, remaining, pct, window, pendingCount };
}

// packages/shared/src/domain/askInsights.ts
var MAX_INSIGHTS = 4;
var VALID_FREQ = /* @__PURE__ */ new Set(["daily", "weekly", "biweekly", "monthly", "quarterly", "yearly"]);
function fmtMoney(v, currency, locale) {
  const whole = Math.abs(v - Math.round(v)) < 5e-3;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: whole ? 0 : 2
    }).format(v);
  } catch {
    return `${currency} ${v.toFixed(whole ? 0 : 2)}`;
  }
}
function fmtDate(instantIso, tz, locale) {
  try {
    return new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", timeZone: tz }).format(new Date(instantIso));
  } catch {
    return instantIso.slice(0, 10);
  }
}
function fill(template, params) {
  return template.replace(/\{(\w+)\}/g, (_, k) => k in params ? String(params[k]) : `{${k}}`);
}
function inSpan(iso, s) {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms >= s.startMs && ms < s.endMs;
}
function amountOf(tx) {
  return typeof tx.amount_in_profile_currency === "number" && Number.isFinite(tx.amount_in_profile_currency) ? tx.amount_in_profile_currency : null;
}
function sumDebits(txns, span, category) {
  let total = 0;
  for (const tx of txns) {
    if (tx.direction !== "debit") continue;
    if (category !== void 0 && (tx.category_name ?? "") !== category) continue;
    if (!inSpan(tx.transacted_at, span)) continue;
    const a = amountOf(tx);
    if (a !== null) total += a;
  }
  return roundCents(total);
}
function sumCredits(txns, span) {
  let total = 0;
  for (const tx of txns) {
    if (tx.direction !== "credit" || !inSpan(tx.transacted_at, span)) continue;
    const a = amountOf(tx);
    if (a !== null) total += a;
  }
  return roundCents(total);
}
function debitsByCategory(txns, span) {
  const out = /* @__PURE__ */ new Map();
  for (const tx of txns) {
    if (tx.direction !== "debit" || !inSpan(tx.transacted_at, span)) continue;
    const a = amountOf(tx);
    if (a === null) continue;
    const key = tx.category_name ?? "";
    out.set(key, (out.get(key) ?? 0) + a);
  }
  return out;
}
function sameSpanMonthsAgo(y, m, d, k, tz) {
  const target = addMonthsClamped(y, m, 1, -k);
  const startIso = monthBounds(`${String(target.y).padStart(4, "0")}-${String(target.m).padStart(2, "0")}`, tz).start;
  const dim = new Date(Date.UTC(target.y, target.m, 0)).getUTCDate();
  const cut = addDays(target.y, target.m, Math.min(d, dim), 1);
  return {
    startMs: Date.parse(startIso),
    endMs: Date.parse(civilDateTimeToInstant(cut.y, cut.m, cut.d, 0, 0, 0, tz))
  };
}
function computeAskInsights(input) {
  const { transactions, currency, locale } = input;
  const tz = safeTz(input.time_zone);
  const now = localParts(input.now_utc, tz);
  const nowMs = Date.parse(input.now_utc);
  const money2 = (v) => fmtMoney(v, currency, locale);
  const T = (key, params = {}) => fill(t(key, locale), params);
  const monthKey = `${String(now.y).padStart(4, "0")}-${String(now.m).padStart(2, "0")}`;
  const monthB = monthBounds(monthKey, tz);
  const monthSpan = { startMs: Date.parse(monthB.start), endMs: Date.parse(monthB.endExclusive) };
  const daysInMonth = new Date(Date.UTC(now.y, now.m, 0)).getUTCDate();
  const daysLeftInMonth = Math.max(1, daysInMonth - now.d + 1);
  const out = [];
  const usable = transactions.filter((tx) => amountOf(tx) !== null);
  if (usable.length < 3) {
    return [
      {
        id: "no_data",
        kind: "no_data",
        score: 100,
        tone: "neutral",
        title: T("ask.insight_nodata_title"),
        detail: T("ask.insight_nodata_detail"),
        question: T("ask.insight_nodata_question"),
        action: { label: T("ask.insight_nodata_action"), intent: "log_expense" }
      }
    ];
  }
  const spentMtd = sumDebits(usable, monthSpan);
  const creditsMtd = sumCredits(usable, monthSpan);
  const incomeBasis = creditsMtd > 0 ? { value: creditsMtd, from: "transactions" } : input.monthly_income && input.monthly_income > 0 ? { value: input.monthly_income, from: "profile" } : null;
  const debitRules = input.rules.filter(
    (r) => r.direction === "debit" && r.is_active !== false && VALID_FREQ.has(r.frequency)
  );
  const ruleAmount = (r) => typeof r.amount_in_profile_currency === "number" && Number.isFinite(r.amount_in_profile_currency) ? r.amount_in_profile_currency : r.amount;
  const recurrenceOf = (r) => r.starts_at ? {
    frequency: r.frequency,
    interval: r.interval ?? 1,
    starts_at: r.starts_at,
    ends_at: r.ends_at ?? null,
    anchor_day: r.anchor_day ?? null,
    anchor_weekday: r.anchor_weekday ?? null,
    anchor_time: r.anchor_time ?? null
  } : null;
  let stillDue = 0;
  for (const r of debitRules) {
    const rec = recurrenceOf(r);
    if (!rec) continue;
    try {
      const occ = occurrencesInWindow(rec, input.now_utc, monthB.endExclusive, tz, { limit: 40 });
      stillDue += occ.length * ruleAmount(r);
    } catch {
    }
  }
  stillDue = roundCents(stillDue);
  {
    let best = null;
    const horizonMs = nowMs + 7 * 864e5;
    for (const r of debitRules) {
      const rec = recurrenceOf(r);
      if (!rec) continue;
      try {
        const occ = firstOccurrenceOnOrAfter(rec, input.now_utc, tz);
        if (!occ) continue;
        const ms = Date.parse(occ.instant);
        if (ms > horizonMs) continue;
        if (!best || ms < Date.parse(best.instant) || ms === Date.parse(best.instant) && ruleAmount(r) > best.amount) {
          best = { name: r.name?.trim() || t("ask.insight_unnamed_rule", locale), amount: ruleAmount(r), instant: occ.instant };
        }
      } catch {
      }
    }
    if (best) {
      const left = incomeBasis ? roundCents(incomeBasis.value - spentMtd - stillDue) : null;
      out.push({
        id: `upcoming:${best.name}`,
        kind: "upcoming_bill",
        score: 90,
        tone: left !== null && left < 0 ? "alert" : "watch",
        title: T("ask.insight_upcoming_title", { name: best.name, amount: money2(best.amount), date: fmtDate(best.instant, tz, locale) }),
        detail: left !== null ? T("ask.insight_upcoming_detail_income", { due: money2(stillDue), left: money2(left) }) : T("ask.insight_upcoming_detail_noincome", { due: money2(stillDue) }),
        question: T("ask.insight_upcoming_question"),
        action: { label: T("ask.insight_upcoming_action"), intent: "open_recurring", params: { name: best.name } }
      });
    }
  }
  const usualDaily = (() => {
    let total = 0;
    let days = 0;
    for (let k = 1; k <= 3; k++) {
      const target = addMonthsClamped(now.y, now.m, 1, -k);
      const key = `${String(target.y).padStart(4, "0")}-${String(target.m).padStart(2, "0")}`;
      const b = monthBounds(key, tz);
      const span = { startMs: Date.parse(b.start), endMs: Date.parse(b.endExclusive) };
      const spent = sumDebits(usable, span);
      if (spent <= 0) continue;
      total += spent;
      days += new Date(Date.UTC(target.y, target.m, 0)).getUTCDate();
    }
    return days > 0 ? total / days : null;
  })();
  if (input.budget) {
    const b = input.budget;
    const days = Math.max(1, b.days_left);
    if (b.remaining < 0) {
      out.push({
        id: "budget",
        kind: "budget_pace",
        score: 95,
        tone: "alert",
        title: T("ask.insight_budget_over_title", { over: money2(Math.abs(b.remaining)) }),
        detail: T("ask.insight_budget_over_detail", { days, period: t(`ask.period_${b.period}`, locale) }),
        question: T("ask.insight_budget_question"),
        action: { label: T("ask.insight_budget_action"), intent: "set_budget" }
      });
    } else {
      const pace = b.remaining / days;
      const tight = usualDaily !== null && pace < usualDaily * 0.8;
      out.push({
        id: "budget",
        kind: "budget_pace",
        score: tight ? 70 : 58,
        tone: tight ? "watch" : "good",
        title: T(tight ? "ask.insight_budget_tight_title" : "ask.insight_budget_ok_title", { left: money2(b.remaining), days }),
        detail: usualDaily !== null ? T(tight ? "ask.insight_budget_tight_detail" : "ask.insight_budget_ok_detail", { pace: money2(roundCents(pace)), usual: money2(roundCents(usualDaily)) }) : T("ask.insight_budget_pace_only", { pace: money2(roundCents(pace)) }),
        question: T("ask.insight_budget_question"),
        action: { label: T("ask.insight_budget_action"), intent: "set_budget" }
      });
    }
  }
  const mtdByCat = debitsByCategory(usable, monthSpan);
  const priorSpans = [1, 2, 3].map((k) => sameSpanMonthsAgo(now.y, now.m, now.d, k, tz));
  const priorByCat = priorSpans.map((s) => debitsByCategory(usable, s));
  let surge = null;
  for (const [cat, amount] of mtdByCat) {
    if (!cat || amount < 25) continue;
    const priors = priorByCat.map((m) => m.get(cat) ?? 0).filter((v) => v > 0);
    if (priors.length < 2) continue;
    const avg = priors.reduce((a, b) => a + b, 0) / priors.length;
    if (avg <= 0) continue;
    const pct = (amount - avg) / avg;
    if (pct < 0.4) continue;
    if (!surge || pct > surge.pct) surge = { category: cat, amount, pct };
  }
  if (surge) {
    const pctRounded = Math.round(surge.pct * 100);
    out.push({
      id: `surge:${surge.category}`,
      kind: "category_surge",
      score: 80 + Math.min(20, pctRounded / 5),
      tone: "alert",
      title: T("ask.insight_surge_title", { category: surge.category, amount: money2(surge.amount) }),
      detail: T("ask.insight_surge_detail", { pct: pctRounded }),
      question: T("ask.insight_surge_question", { category: surge.category }),
      action: {
        label: T("ask.insight_surge_action"),
        intent: "show_transactions",
        params: { category_name: surge.category, month: monthKey }
      }
    });
  }
  {
    const normalized = debitRules.map((r) => ({
      name: r.name?.trim() || t("ask.insight_unnamed_rule", locale),
      monthly: monthlyEquivalent({ frequency: r.frequency, interval: r.interval ?? 1, amount: ruleAmount(r) })
    })).sort((a, b) => b.monthly - a.monthly);
    const total = roundCents(normalized.reduce((a, r) => a + r.monthly, 0));
    if (normalized.length >= 2 || total >= 50) {
      const [a, b] = normalized;
      const title = normalized.length === 1 ? T("ask.insight_subs_title_one", { a: a.name, total: money2(total) }) : normalized.length === 2 ? T("ask.insight_subs_title_two", { a: a.name, b: b.name, total: money2(total) }) : T("ask.insight_subs_title_many", { a: a.name, b: b.name, n: normalized.length - 2, total: money2(total) });
      out.push({
        id: "subs",
        kind: "subscriptions",
        score: 55,
        tone: "neutral",
        title,
        detail: T("ask.insight_subs_detail"),
        question: T("ask.insight_subs_question"),
        action: { label: T("ask.insight_upcoming_action"), intent: "open_recurring" }
      });
    }
  }
  {
    const lastByCat = priorByCat[0];
    let best = null;
    const cats = /* @__PURE__ */ new Set([...mtdByCat.keys(), ...lastByCat.keys()]);
    for (const cat of cats) {
      if (!cat || surge && cat === surge.category) continue;
      const delta = roundCents((mtdByCat.get(cat) ?? 0) - (lastByCat.get(cat) ?? 0));
      if (Math.abs(delta) < 30) continue;
      if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { category: cat, delta };
    }
    if (best) {
      out.push({
        id: `delta:${best.category}`,
        kind: "month_delta",
        score: 50,
        tone: best.delta > 0 ? "watch" : "good",
        title: T("ask.insight_delta_title", { category: best.category }),
        detail: T(best.delta > 0 ? "ask.insight_delta_detail_up" : "ask.insight_delta_detail_down", { delta: money2(Math.abs(best.delta)) }),
        question: T("ask.insight_delta_question", { category: best.category }),
        action: {
          label: T("ask.insight_surge_action"),
          intent: "show_transactions",
          params: { category_name: best.category, month: monthKey }
        }
      });
    }
  }
  if (incomeBasis) {
    const over = roundCents(spentMtd - incomeBasis.value);
    if (over > 0) {
      out.push({
        id: "netflow",
        kind: "net_flow",
        score: 75,
        tone: "alert",
        title: T("ask.insight_netflow_over_title", { over: money2(over) }),
        detail: T("ask.insight_netflow_over_detail", { spent: money2(spentMtd), income: money2(incomeBasis.value) }),
        question: T("ask.insight_netflow_question"),
        action: null
      });
    } else if (spentMtd > 0) {
      out.push({
        id: "netflow",
        kind: "net_flow",
        score: 45,
        tone: "neutral",
        title: T("ask.insight_netflow_title", { spent: money2(spentMtd), income: money2(incomeBasis.value) }),
        detail: T("ask.insight_netflow_detail", { left: money2(roundCents(incomeBasis.value - spentMtd)), days: daysLeftInMonth }),
        question: T("ask.insight_netflow_question"),
        action: null
      });
    }
  }
  {
    const weekSpan = { startMs: nowMs - 7 * 864e5, endMs: nowMs + 1 };
    const ninety = { startMs: nowMs - 90 * 864e5, endMs: nowMs + 1 };
    const debits90 = usable.filter((tx) => tx.direction === "debit" && inSpan(tx.transacted_at, ninety)).map((tx) => amountOf(tx)).sort((a, b) => a - b);
    if (debits90.length >= 8) {
      const median = debits90[Math.floor(debits90.length / 2)];
      let best = null;
      for (const tx of usable) {
        if (tx.direction !== "debit" || tx.is_recurring || !inSpan(tx.transacted_at, weekSpan)) continue;
        const a = amountOf(tx);
        if (a < 100 || a < 3 * median) continue;
        if (!best || a > amountOf(best)) best = tx;
      }
      if (best && median > 0) {
        const a = amountOf(best);
        const merchant = best.merchant?.trim() || best.category_name || t("ask.insight_unnamed_rule", locale);
        out.push({
          id: `large:${best.transacted_at}`,
          kind: "large_transaction",
          score: 60,
          tone: "watch",
          title: T("ask.insight_large_title", { merchant, amount: money2(a), date: fmtDate(best.transacted_at, tz, locale) }),
          detail: T("ask.insight_large_detail", { times: Math.round(a / median) }),
          question: T("ask.insight_large_question", { merchant }),
          action: { label: T("ask.insight_large_action"), intent: "show_transactions", params: { query: merchant } }
        });
      }
    }
  }
  const seen = /* @__PURE__ */ new Set();
  return out.sort((a, b) => b.score - a.score).filter((i) => seen.has(i.kind) ? false : (seen.add(i.kind), true)).slice(0, MAX_INSIGHTS);
}
function safeTz(tz) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
}

// packages/shared/src/domain/notifications.ts
var PRIORITY = {
  billing_issue: 100,
  trial_ending: 95,
  plus_lapsed: 90,
  bill_tomorrow: 85,
  budget_over: 80,
  bill_missing: 75,
  budget_80: 70,
  budget_category_over: 65,
  bill_week_heavy: 55,
  month_closed: 50,
  category_surge: 45,
  weekly_recap: 40,
  winback_14: 30,
  winback_30: 28,
  winback_60: 26
};
var DAY_MS = 864e5;
function money(v, currency, locale) {
  const whole = Math.abs(v - Math.round(v)) < 5e-3;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: whole ? 0 : 2
    }).format(v);
  } catch {
    return `${currency} ${v.toFixed(whole ? 0 : 2)}`;
  }
}
function fill2(template, params) {
  return template.replace(/\{(\w+)\}/g, (_, k) => k in params ? String(params[k]) : `{${k}}`);
}
function amountOf2(tx) {
  return typeof tx.amount_in_profile_currency === "number" && Number.isFinite(tx.amount_in_profile_currency) ? tx.amount_in_profile_currency : null;
}
function daysBetween2(aMs, bMs) {
  return Math.floor((bMs - aMs) / DAY_MS);
}
function planNotifications(input) {
  const { nowUtc, timeZone: tz, locale, currency, plus } = input;
  const nowMs = Date.parse(nowUtc);
  if (!Number.isFinite(nowMs)) return [];
  const T = (key, params = {}) => fill2(t(key, locale), params);
  const m = (v) => money(v, currency, locale);
  const out = [];
  if (plus.plus_billing_issue_at) {
    const graceMs = plus.plus_grace_until ? Date.parse(plus.plus_grace_until) : NaN;
    const stillInGrace = Number.isFinite(graceMs) && graceMs > nowMs;
    out.push({
      family: "money",
      kind: "billing_issue",
      dedupeKey: `billing_issue:${plus.plus_billing_issue_at}`,
      priority: PRIORITY.billing_issue,
      title: T("notif.billing_issue_title"),
      body: stillInGrace ? T("notif.billing_issue_body_grace", { days: Math.max(1, daysBetween2(nowMs, graceMs)) }) : T("notif.billing_issue_body"),
      data: { screen: "paywall", reason: "billing_issue" },
      urgency: "time-sensitive",
      transactional: true
    });
  }
  if (plus.plus_status === "active" && plus.plus_period_type === "trial" && plus.plus_expires_at) {
    const endMs = Date.parse(plus.plus_expires_at);
    const daysLeft = daysBetween2(nowMs, endMs);
    if (Number.isFinite(endMs) && endMs > nowMs && daysLeft <= 2) {
      const willRenew = plus.plus_will_renew !== false;
      out.push({
        family: "money",
        kind: "trial_ending",
        dedupeKey: `trial_ending:${plus.plus_expires_at}`,
        priority: PRIORITY.trial_ending,
        title: willRenew ? T("notif.trial_ending_title") : T("notif.trial_ending_off_title"),
        body: willRenew ? T("notif.trial_ending_body", { days: Math.max(1, daysLeft + 1) }) : T("notif.trial_ending_off_body"),
        data: { screen: "paywall", reason: "trial_ending" },
        urgency: "active",
        transactional: true
      });
    }
  }
  if (plus.plus_status === "lapsed" && plus.plus_expires_at && !plus.plus_billing_issue_at) {
    const endedMs = Date.parse(plus.plus_expires_at);
    if (Number.isFinite(endedMs) && nowMs - endedMs < 3 * DAY_MS && endedMs <= nowMs) {
      out.push({
        family: "money",
        kind: "plus_lapsed",
        dedupeKey: `plus_lapsed:${plus.plus_expires_at}`,
        priority: PRIORITY.plus_lapsed,
        title: T("notif.plus_lapsed_title"),
        body: T("notif.plus_lapsed_body"),
        data: { screen: "paywall", reason: "lapsed" },
        urgency: "passive",
        transactional: true
      });
    }
  }
  const debitRules = input.rules.filter(
    (r) => r.direction === "debit" && r.is_active !== false && r.starts_at
  );
  const ruleAmount = (r) => typeof r.amount_in_profile_currency === "number" && Number.isFinite(r.amount_in_profile_currency) ? r.amount_in_profile_currency : r.amount;
  const recurrenceOf = (r) => r.starts_at ? {
    frequency: r.frequency,
    interval: r.interval ?? 1,
    starts_at: r.starts_at,
    ends_at: r.ends_at ?? null,
    anchor_day: r.anchor_day ?? null,
    anchor_weekday: r.anchor_weekday ?? null,
    anchor_time: r.anchor_time ?? null
  } : null;
  const upcoming = [];
  for (const r of debitRules) {
    const rec = recurrenceOf(r);
    if (!rec) continue;
    try {
      const occ = occurrencesInWindow(rec, nowUtc, new Date(nowMs + 7 * DAY_MS).toISOString(), tz, { limit: 20 });
      for (const o of occ) {
        upcoming.push({
          name: r.name?.trim() || t("ask.insight_unnamed_rule", locale),
          amount: ruleAmount(r),
          instant: o.instant,
          ruleId: String(r.id ?? r.name ?? "rule"),
          occurrenceDate: o.occurrenceDate
        });
      }
    } catch {
    }
  }
  upcoming.sort((a, b) => Date.parse(a.instant) - Date.parse(b.instant));
  let stillDue = 0;
  const monthEnd = (() => {
    const p = localParts(nowUtc, tz);
    const dim = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();
    return Date.parse(nowUtc) + Math.max(0, dim - p.d + 1) * DAY_MS;
  })();
  for (const r of debitRules) {
    const rec = recurrenceOf(r);
    if (!rec) continue;
    try {
      const occ = occurrencesInWindow(rec, nowUtc, new Date(monthEnd).toISOString(), tz, { limit: 40 });
      stillDue += occ.length * ruleAmount(r);
    } catch {
    }
  }
  stillDue = roundCents(stillDue);
  const monthKey = localDay(nowUtc, tz).slice(0, 7);
  const spentThisMonth = input.transactions.reduce((sum, tx) => {
    if (tx.direction !== "debit") return sum;
    if (localDay(tx.transacted_at, tz).slice(0, 7) !== monthKey) return sum;
    return sum + (amountOf2(tx) ?? 0);
  }, 0);
  const incomeThisMonth = input.transactions.reduce((sum, tx) => {
    if (tx.direction !== "credit") return sum;
    if (localDay(tx.transacted_at, tz).slice(0, 7) !== monthKey) return sum;
    return sum + (amountOf2(tx) ?? 0);
  }, 0);
  const incomeBasis = incomeThisMonth > 0 ? incomeThisMonth : input.monthlyIncome && input.monthlyIncome > 0 ? input.monthlyIncome : null;
  const leftAfterBills = incomeBasis !== null ? roundCents(incomeBasis - spentThisMonth - stillDue) : null;
  const tomorrow = upcoming.find((u) => {
    const inMs = Date.parse(u.instant) - nowMs;
    return inMs > 0 && inMs <= 36 * 3600 * 1e3;
  });
  if (tomorrow) {
    out.push({
      family: "bill",
      kind: "bill_tomorrow",
      dedupeKey: `bill_tomorrow:${tomorrow.ruleId}:${tomorrow.occurrenceDate}`,
      priority: PRIORITY.bill_tomorrow,
      title: T("notif.bill_tomorrow_title", { name: tomorrow.name, amount: m(tomorrow.amount) }),
      body: leftAfterBills !== null ? T("notif.bill_tomorrow_body_left", { left: m(leftAfterBills) }) : T("notif.bill_tomorrow_body", { due: m(stillDue) }),
      data: { screen: "recurring", rule: tomorrow.ruleId },
      // Money leaving an account within a day is the definition of the
      // level: still actionable, and useless if it arrives late.
      urgency: "time-sensitive"
    });
  } else if (upcoming.length >= 3) {
    const total = roundCents(upcoming.reduce((s, u) => s + u.amount, 0));
    out.push({
      family: "bill",
      kind: "bill_week_heavy",
      dedupeKey: `bill_week_heavy:${localDay(nowUtc, tz)}`,
      priority: PRIORITY.bill_week_heavy,
      title: T("notif.bill_week_title", { count: upcoming.length, amount: m(total) }),
      body: T("notif.bill_week_body", { name: upcoming[0].name, amount: m(upcoming[0].amount) }),
      data: { screen: "recurring" },
      urgency: "passive"
    });
  }
  for (const r of debitRules) {
    const rec = recurrenceOf(r);
    if (!rec) continue;
    let occ;
    try {
      occ = occurrencesInWindow(rec, new Date(nowMs - 9 * DAY_MS).toISOString(), new Date(nowMs - 2 * DAY_MS).toISOString(), tz, { limit: 5 });
    } catch {
      continue;
    }
    if (!occ.length) continue;
    const last = occ[occ.length - 1];
    const amount = ruleAmount(r);
    const matched = input.transactions.some((tx) => {
      if (tx.direction !== "debit") return false;
      const txMs = Date.parse(tx.transacted_at);
      if (!Number.isFinite(txMs)) return false;
      if (Math.abs(txMs - Date.parse(last.instant)) > 3 * DAY_MS) return false;
      const a = amountOf2(tx);
      return a !== null && Math.abs(a - amount) <= Math.max(1, amount * 0.1);
    });
    if (matched) continue;
    out.push({
      family: "bill",
      kind: "bill_missing",
      dedupeKey: `bill_missing:${String(r.id ?? r.name)}:${last.occurrenceDate}`,
      priority: PRIORITY.bill_missing,
      title: T("notif.bill_missing_title", { name: r.name?.trim() || t("ask.insight_unnamed_rule", locale) }),
      body: T("notif.bill_missing_body", { amount: m(amount) }),
      data: { screen: "recurring", rule: String(r.id ?? "") },
      urgency: "active"
    });
    break;
  }
  const budgetRules = input.rules.filter(
    (r) => Boolean(r.id && r.starts_at && typeof r.amount === "number")
  );
  const budgetTxns = input.transactions;
  for (const b of input.budgets) {
    let status;
    try {
      status = budgetStatus(b, budgetTxns, budgetRules, tz, nowUtc);
    } catch {
      continue;
    }
    const windowKey = String(status.window.start ?? "").slice(0, 10);
    const daysLeft = Math.max(0, Math.ceil((Date.parse(String(status.window.endExclusive)) - nowMs) / DAY_MS));
    const isCategory = b.category_id != null;
    if (status.pct >= 1) {
      out.push({
        family: "budget",
        kind: isCategory ? "budget_category_over" : "budget_over",
        dedupeKey: `${isCategory ? "budget_category_over" : "budget_over"}:${b.id}:${windowKey}`,
        priority: isCategory ? PRIORITY.budget_category_over : PRIORITY.budget_over,
        title: isCategory ? T("notif.budget_category_over_title", { category: b.category_name ?? "", over: m(Math.abs(status.remaining)) }) : T("notif.budget_over_title", { over: m(Math.abs(status.remaining)) }),
        body: T("notif.budget_over_body", { days: daysLeft }),
        data: { screen: "budgets", budget: b.id },
        urgency: "active"
      });
    } else if (status.pct >= 0.8 && daysLeft >= 2 && !isCategory) {
      const perDay = roundCents(status.remaining / Math.max(1, daysLeft));
      out.push({
        family: "budget",
        kind: "budget_80",
        dedupeKey: `budget_80:${b.id}:${windowKey}`,
        priority: PRIORITY.budget_80,
        title: T("notif.budget_80_title", { pct: Math.round(status.pct * 100), days: daysLeft }),
        body: T("notif.budget_80_body", { perDay: m(perDay), left: m(status.remaining) }),
        data: { screen: "budgets", budget: b.id },
        urgency: "active"
      });
    }
  }
  const local = localParts(nowUtc, tz);
  const isSunday = local.weekdayIndex === 6;
  let insights = [];
  try {
    insights = computeAskInsights({
      transactions: input.transactions,
      rules: input.rules,
      budget: input.budgets.find((b) => b.category_id == null) ?? null,
      monthly_income: input.monthlyIncome,
      now_utc: nowUtc,
      time_zone: tz,
      currency,
      locale
    });
  } catch {
    insights = [];
  }
  const surge = insights.find((i) => i.kind === "category_surge");
  if (surge) {
    out.push({
      family: "insight",
      kind: "category_surge",
      dedupeKey: `category_surge:${surge.id}:${monthKey}`,
      priority: PRIORITY.category_surge,
      title: surge.title,
      body: surge.detail,
      data: { screen: "ask", insight: surge.id },
      urgency: "passive"
    });
  }
  if (local.d === 1) {
    const delta = insights.find((i) => i.kind === "month_delta");
    if (delta) {
      out.push({
        family: "insight",
        kind: "month_closed",
        dedupeKey: `month_closed:${monthKey}`,
        priority: PRIORITY.month_closed,
        title: delta.title,
        body: delta.detail,
        data: { screen: "insights" },
        urgency: "passive"
      });
    }
  }
  if (isSunday) {
    const weekStart2 = nowMs - 7 * DAY_MS;
    const weekTxns = input.transactions.filter(
      (tx) => tx.direction === "debit" && Date.parse(tx.transacted_at) >= weekStart2 && amountOf2(tx) !== null
    );
    if (weekTxns.length >= 5) {
      const total = roundCents(weekTxns.reduce((s, tx) => s + (amountOf2(tx) ?? 0), 0));
      const byCategory = /* @__PURE__ */ new Map();
      for (const tx of weekTxns) {
        const k = tx.category_name ?? "";
        byCategory.set(k, (byCategory.get(k) ?? 0) + (amountOf2(tx) ?? 0));
      }
      let top = null;
      for (const entry of byCategory) if (!top || entry[1] > top[1]) top = entry;
      out.push({
        family: "insight",
        kind: "weekly_recap",
        dedupeKey: `weekly_recap:${localDay(nowUtc, tz)}`,
        priority: PRIORITY.weekly_recap,
        title: T("notif.weekly_recap_title", { amount: m(total) }),
        body: top && top[0] ? T("notif.weekly_recap_body_top", { count: weekTxns.length, category: top[0], amount: m(roundCents(top[1])) }) : T("notif.weekly_recap_body", { count: weekTxns.length }),
        data: { screen: "insights" },
        urgency: "passive"
      });
    }
  }
  if (input.lastLoggedAt) {
    const idleDays = daysBetween2(Date.parse(input.lastLoggedAt), nowMs);
    const step = idleDays >= 60 ? 60 : idleDays >= 30 ? 30 : idleDays >= 14 ? 14 : null;
    if (step) {
      const kind = `winback_${step}`;
      const hasBills = upcoming.length > 0;
      out.push({
        family: "habit",
        kind,
        dedupeKey: `${kind}:${localDay(input.lastLoggedAt, tz)}`,
        priority: PRIORITY[kind],
        title: hasBills ? T("notif.winback_bills_title", { count: upcoming.length }) : T(`notif.${kind}_title`),
        body: hasBills ? T("notif.winback_bills_body", { name: upcoming[0].name, amount: m(upcoming[0].amount) }) : T(`notif.${kind}_body`),
        data: { screen: hasBills ? "recurring" : "record" },
        urgency: "passive"
      });
    }
  }
  return out;
}
var DEFAULT_NOTIFICATION_PREFS = {
  receipts: true,
  bills: true,
  budget: true,
  insights: true,
  habit: true,
  quiet_start: 22,
  quiet_end: 8,
  max_per_week: 3
};
var FAMILY_SWITCH = {
  receipt: "receipts",
  bill: "bills",
  budget: "budget",
  insight: "insights",
  habit: "habit",
  money: null
  // transactional, no switch
};
function inQuietHours(hour, start, end) {
  if (start === end) return false;
  return start < end ? hour >= start && hour < end : hour >= start || hour < end;
}
function govern(candidates, state) {
  const { prefs } = state;
  const eligible = candidates.filter((c) => {
    if (state.alreadySent.has(c.dedupeKey)) return false;
    if (inQuietHours(state.localHour, prefs.quiet_start, prefs.quiet_end)) return false;
    if (c.transactional) return true;
    const key = FAMILY_SWITCH[c.family];
    if (key && prefs[key] === false) return false;
    if (state.sentToday >= 1) return false;
    if (state.sentLast7Days >= prefs.max_per_week) return false;
    return true;
  });
  if (!eligible.length) return null;
  return eligible.reduce((best, c) => c.priority > best.priority ? c : best);
}
export {
  DEFAULT_NOTIFICATION_PREFS,
  addDays,
  budgetStatus,
  civilDateTimeToInstant,
  computeAskInsights,
  firstOccurrenceOnOrAfter,
  govern,
  inQuietHours,
  localDay,
  localParts,
  monthBounds,
  nextOccurrence,
  occurrencesDue,
  occurrencesInWindow,
  planNotifications,
  roundCents,
  t
};
