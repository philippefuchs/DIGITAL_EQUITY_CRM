import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';

type Block =
  | { t: 'p'; text: string }
  | { t: 'h'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'ol'; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] };

interface Section { id: string; title: string; blocks: Block[] }

const p = (text: string): Block => ({ t: 'p', text });
const h = (text: string): Block => ({ t: 'h', text });
const ul = (...items: string[]): Block => ({ t: 'ul', items });
const ol = (...items: string[]): Block => ({ t: 'ol', items });
const table = (head: string[], ...rows: string[][]): Block => ({ t: 'table', head, rows });

const SECTIONS: Section[] = [
  {
    id: 'intro',
    title: 'À quoi sert le CRM et comment s\'y repérer',
    blocks: [
      p('Le CRM réunit vos contacts, vos emails de prospection et leur suivi : une fiche par personne, des campagnes pour écrire à plusieurs, des écrans pour suivre les résultats. Tout se pilote depuis le menu de gauche.'),
      table(['Entrée du menu', 'Ce qu\'on y fait'],
        ['Analytics', 'Tableau de bord : membres, leads, rendez-vous, refus, répartition et secteurs porteurs'],
        ['Scan Card', 'Photographier une carte de visite : l\'IA remplit une fiche, à corriger avant de l\'ajouter'],
        ['IA Enrich', 'Saisir « Prénom Nom Société » : l\'IA cherche un email et un téléphone professionnels'],
        ['Prospect, Membre, ESN…', 'Une entrée par catégorie : liste des contacts, recherche, ajout, import CSV, fiche'],
        ['Catégories', 'Créer ses catégories, avec leur couleur et le statut donné par défaut'],
        ['Doublons', 'Repérer les contacts qui ont le même email, puis les fusionner ou les supprimer'],
        ['Pipeline', 'Tableau d\'affaires à faire glisser d\'une étape à l\'autre'],
        ['Calendrier', 'Rendez-vous avec rappel, liés ou non à un contact'],
        ['IA Carousel', 'Générer un carrousel LinkedIn en PDF à partir d\'un sujet'],
        ['Campagnes', 'Envoyer le même message à plusieurs contacts, suivre les envois, qualifier les retours'],
        ['À relancer', 'Relancer en lot les personnes qui n\'ont pas répondu (nouveau)'],
        ['Réponses', 'Importer dans le CRM les réponses lues dans la messagerie (nouveau)'],
        ['E-mail Library', 'Bibliothèque de modèles d\'emails'],
        ['Export', 'Fichiers CSV : contacts, emails envoyés, relances non lues, inscriptions, rendez-vous'],
        ['Maintenance', 'Réglages d\'envoi (EmailJS), logo et guide intégré'],
      ),
      h('Une journée type'),
      ol(
        'Alimenter la base : Scan Card, extension Chrome, import CSV, puis Doublons de temps en temps.',
        'Choisir ou écrire le message dans E-mail Library.',
        'Envoyer dans Campagnes (assistant en 4 étapes), ou depuis une fiche pour un seul contact.',
        'Traiter les réponses reçues dans la messagerie avec l\'écran Réponses.',
        'Contrôler Analytics, et lancer les relances depuis « À relancer » sur ceux qui n\'ont pas répondu.',
      ),
    ],
  },
  {
    id: 'contacts',
    title: 'Les contacts : listes, fiche, ajout, import, doublons',
    blocks: [
      p('Chaque personne a une fiche unique, rangée dans une catégorie (Prospect, Membre, ESN ou une catégorie créée par vous) et porteuse d\'un statut. Ces deux repères commandent presque tout le reste : ciblage des campagnes, Analytics, exports.'),
      h('Les listes par catégorie'),
      p('Une entrée du menu par catégorie ouvre la liste de ses contacts, avec photo, nom, société, poste, statut et score. La barre de recherche filtre sur le nom et la société seulement : on ne retrouve pas quelqu\'un par son email ni par un tag. Le bouton « Ajouter » crée une fiche dans la catégorie affichée, et « Scorer IA » demande à l\'IA une note de 0 à 100.'),
      h('Les statuts'),
      table(['Statut', 'Sens'],
        ['New', 'Jamais contacté'],
        ['Contacted', 'Un email est parti'],
        ['Interested', 'A montré de l\'intérêt'],
        ['Active', 'Membre ou partenaire actif'],
        ['Closed', 'Affaire conclue'],
        ['Lost', 'Refus ou sans suite'],
      ),
      p('L\'envoi d\'une campagne ou d\'une relance fait passer tout seul un contact « New » (ou sans statut) à « Contacted » ; les autres statuts ne bougent jamais. Dans les autres cas, le statut ne change qu\'à la main (champ « Statut CRM » de la fiche) ou par l\'import des réponses. Les contacts déjà atteints avant le 15/11/2026 n\'ont pas été rattrapés.'),
      h('La fiche contact'),
      p('La fiche s\'ouvre en fenêtre, sur quatre onglets : Info (coordonnées, statut, score, tags, notes), Historique, Email et Agenda. L\'historique est une frise chronologique : emails envoyés (avec l\'indicateur « Lu » quand le pixel de suivi a été chargé), réponses importées, notes, appels et rendez-vous saisis à la main. C\'est la mémoire de la relation, mais seulement si on y inscrit les échanges. L\'onglet Agenda liste les rendez-vous du contact ; pour en créer un, il renvoie vers le Calendrier.'),
      h('Alimenter la base'),
      ul(
        '**Ajout manuel** : formulaire de fiche, avec photo facultative.',
        '**Import CSV** : le fichier est d\'abord analysé, et rien n\'est écrit avant votre accord. L\'aperçu compte les nouveaux contacts, ceux déjà en base (reconnus par LinkedIn, email, ou prénom + nom + société), les homonymes et les lignes écartées (email invalide, ligne répétée dans le fichier). Les doublons ne sont pas recréés : une case permet de compléter leurs champs vides sans rien écraser. Un homonyme (même nom, autre société, sans email commun) n\'est importé que si vous le cochez. Le fichier peut être séparé par des virgules, des points-virgules ou des tabulations, et les statuts « Nouveau » ou « Contacté » sont compris. Un modèle est téléchargeable.',
        '**Scan Card** : une photo de carte de visite, l\'IA extrait nom, société, poste, email et téléphone. Relire avant de valider : la lecture d\'une photo peut se tromper.',
        '**IA Enrich** : à partir de « Prénom Nom Société », l\'IA propose un email et un téléphone professionnels. Ce sont des suppositions à vérifier, pas des données certifiées.',
        '**Extension Chrome** : depuis un profil LinkedIn, elle envoie la personne au CRM. Un nouveau contact est créé en catégorie Prospect avec le statut New ; si la personne existe déjà (même adresse LinkedIn, ou même email et même nom), la fiche est complétée sans changer sa catégorie ni son statut.',
      ),
      h('Doublons et catégories'),
      p('L\'écran Doublons regroupe les contacts qui partagent le même email et propose de les fusionner ou d\'en supprimer un. Attention : supprimer une fiche supprime aussi son historique, ses emails et ses affaires ; la fusion est donc le bon réflexe. L\'écran Catégories permet de créer une catégorie, de choisir sa couleur et le statut de départ de ses contacts.'),
    ],
  },
  {
    id: 'emails',
    title: 'Les emails : modèles, envoi, campagnes et suivi',
    blocks: [
      p('Les emails partent du navigateur, via le service EmailJS configuré dans Maintenance. Une campagne n\'est donc envoyée que tant que l\'onglet du CRM reste ouvert : fermer la page ou mettre l\'ordinateur en veille interrompt l\'envoi, et rien ne permet de programmer un envoi pour plus tard.'),
      h('Modèles (E-mail Library)'),
      p('La bibliothèque range les messages réutilisables : on les crée, on les modifie, et on les choisit au moment d\'écrire à un contact, de composer une campagne ou de relancer. Les champs de personnalisation ({{Prénom}}, {{Nom}}, {{company}}) sont remplacés contact par contact à l\'envoi.'),
      h('Un email à un seul contact'),
      p('Dans l\'onglet Email de la fiche, on écrit ou on choisit un modèle, puis on envoie. L\'email est enregistré dans l\'historique de la fiche, mais le statut du contact reste inchangé : il faut le passer à « Contacted » soi-même.'),
      h('Les campagnes (assistant en quatre étapes)'),
      ol(
        '**Config** : nom de la campagne et objectif (Rendez-vous, Salon Pro ou Intérêt Pur), qui déterminent les résultats enregistrables ensuite.',
        '**Ciblage** : filtre par catégorie et par recherche (nom, société), puis on coche les destinataires un à un ou avec Tout / Aucun. Il n\'y a pas de filtre par statut ni par tag, et les contacts marqués « Désinscrit » sont exclus automatiquement.',
        '**Message** : objet et corps, à partir d\'un modèle ou écrits sur place, avec {{Prénom}}, {{Nom}} et {{company}}.',
        '**Final** : récapitulatif, puis lancement.',
      ),
      p('Une campagne passe de Brouillon à En cours quand on la lance. Elle ne devient Terminée que lorsqu\'on ouvre l\'action Qualifier, qu\'on marque le résultat de chaque cible (inscrit, rendez-vous, intérêt, refus, sans réponse) puis qu\'on clique sur Terminer le workflow. Cette étape manuelle est la plus oubliée : Analytics en dépend.'),
      h('Le suivi d\'ouverture'),
      p('Chaque email contient une image invisible hébergée par le CRM. Quand le destinataire l\'affiche, l\'email passe à « ouvert » avec la date, l\'indicateur « Lu » apparaît dans la fiche et le score du contact gagne 5 points (plafond 100). Ce suivi est indicatif : un client de messagerie qui bloque les images masque l\'ouverture, et certains outils de sécurité la déclenchent à la place du destinataire. Une absence d\'ouverture ne prouve pas que le message n\'a pas été lu.'),
    ],
  },
  {
    id: 'reponses',
    title: 'L\'écran Réponses : traiter la boîte mail sans ressaisie',
    blocks: [
      p('L\'écran Réponses transforme les réponses reçues par email en historique, statuts et résultats de campagne, sans les recopier. Le CRM ne lit pas la messagerie : c\'est l\'assistant Claude d\'Eric, connecté à sa messagerie, qui la lit et produit une liste à coller dans l\'écran.'),
      h('Le déroulé'),
      ol(
        'Dans Réponses, copier ou télécharger la consigne destinée à Claude.',
        'La donner à Claude avec accès à la messagerie ; il relève les réponses de la période et rend une liste JSON (email, nom, date, classement, résumé, événement, personnes, référence).',
        'Coller cette liste dans l\'écran, choisir au besoin la campagne concernée, cliquer sur Analyser.',
        'Contrôler chaque ligne : contact reconnu, classement, résumé, cases à cocher pour le statut, le tag et le résultat de campagne.',
        'Cliquer sur Importer.',
      ),
      h('Ce que fait l\'import'),
      table(['Classement de la réponse', 'Statut', 'Tag', 'Résultat de campagne'],
        ['Présent', 'Interested', 'Présent – nom de l\'événement', 'Registered'],
        ['Intéressé', 'Interested', 'aucun', 'Positive'],
        ['À rappeler', 'Contacted', 'aucun', 'aucun'],
        ['Absent', 'inchangé', 'aucun', 'Negative'],
        ['Refus', 'Lost', 'aucun', 'Negative'],
        ['Désinscription', 'Lost', 'Désinscrit', 'Negative'],
        ['Email invalide', 'inchangé', 'Email invalide', 'Bounced'],
        ['Réponse automatique, Autre', 'inchangé', 'aucun', 'aucun'],
      ),
      p('Le tag « Désinscrit » retire le contact des cibles de campagne et de tout envoi. Toute réponse importée s\'ajoute à l\'historique de la fiche comme « Réponse reçue ». Le contact est retrouvé par son email (y compris une ligne « Autre email » des notes), sinon par une suggestion de nom ou une recherche à la main. L\'import ne crée jamais de contact, ne fait jamais reculer un statut (un membre Active ou Closed n\'est pas modifié) et écarte une réponse déjà importée, ce qui permet de relancer l\'opération sur une période qui se recoupe.'),
      p('Le résultat de campagne n\'est écrit que pour les contacts effectivement ciblés par la campagne choisie.'),
    ],
  },
  {
    id: 'relancer',
    title: 'L\'écran À relancer : qui relancer, et comment',
    blocks: [
      p('L\'écran « À relancer » liste les personnes à qui un email est parti sans réponse depuis, et permet de les relancer en lot.'),
      h('Qui apparaît dans la liste'),
      p('Une personne est proposée quand son dernier email date d\'au moins N jours (7 par défaut, modifiable de 0 à 365, avec des raccourcis 3, 7, 14 et 30). Sont exclus : les personnes qui ont répondu depuis leur dernier email, les désinscrits, les emails invalides, les statuts Perdu (Lost) et Clos (Closed), et les fiches sans adresse valide. Les filtres portent sur l\'ouverture (tous, jamais ouvert, ouvert sans réponse), la catégorie, le nombre d\'emails déjà reçus et l\'inclusion des membres « Active ». Le délai et les filtres choisis sont mémorisés dans le navigateur. Chaque ligne montre le dernier objet, le nombre de jours, le nombre d\'emails reçus et l\'ouverture.'),
      p('La liste n\'est juste que si les réponses lues dans la messagerie ont été importées avant avec l\'écran Réponses : sans cela, quelqu\'un qui a répondu par mail reste proposé.'),
      h('Relancer'),
      p('On coche les personnes, puis « Relancer la sélection ». On part d\'un modèle ou on écrit un message (champs {{Prénom}}, {{Nom}} et {{company}}), un aperçu montre le rendu pour la première personne, puis l\'envoi part tout de suite, avec le suivi d\'ouverture. Il faut garder l\'onglet ouvert jusqu\'à la fin. Le contact « New » passe à « Contacted » et l\'email est enregistré dans son historique, sans campagne associée. Un bouton CSV exporte la liste affichée ou la sélection.'),
    ],
  },
  {
    id: 'suivi',
    title: 'Suivre et mesurer : Analytics, Pipeline, Calendrier, Export',
    blocks: [
      p('Ces quatre écrans servent à piloter l\'activité, mais plusieurs dépendent de données saisies à la main, ce qui peut les laisser vides ou trompeurs.'),
      h('Analytics'),
      p('Le tableau de bord affiche sept compteurs (Membres, Leads, RDV, Pistes, Refus, Incertains, Salon), une répartition en secteurs avec pourcentages et les cinq secteurs les plus porteurs. Membres et Leads comptent simplement les fiches par catégorie. Les autres (rendez-vous, refus, incertains, inscrits au salon) se calculent à partir des résultats saisis dans la qualification des campagnes : sans qualification, ils restent à zéro quelle que soit la réalité du terrain. L\'import des réponses les alimente désormais pour les contacts ciblés.'),
      h('Pipeline'),
      p('Tableau d\'affaires en colonnes : Nouveau, Contacté, Intéressé, Négociation, Gagné, Perdu. On crée une opportunité liée à un contact (titre, valeur en euros, probabilité, date de clôture estimée), on la fait glisser d\'une colonne à l\'autre, on cherche par mot-clé et on peut passer en vue compacte. Chaque affaire se crée à la main : elle n\'est pas déduite du statut du contact.'),
      h('Calendrier et rappels'),
      p('On y planifie un rendez-vous avec titre, début, notes, contact lié facultatif et rappel (15 ou 30 minutes, 1 heure ou 1 jour avant, ou aucun). Le rappel ne s\'affiche que dans le CRM, si l\'application est ouverte au bon moment : aucun email ni notification sur le téléphone. Aucune synchronisation avec Google ou Outlook n\'existe, quoi que dise le guide intégré.'),
      h('Export'),
      p('L\'écran Export produit des fichiers CSV lisibles dans Excel : tous les contacts, les membres, l\'historique des emails envoyés, la base complète en sauvegarde, les inscriptions à un événement, les rendez-vous qualifiés, les intérêts positifs, un rapport d\'impact par campagne et la liste « relances non lues ». Cette dernière est approximative : elle reprend tout contact ayant au moins un email sans ouverture enregistrée, même s\'il en a ouvert un autre, répondu ou demandé à se désinscrire. Pour relancer, l\'écran « À relancer » est plus précis et permet d\'envoyer directement.'),
    ],
  },
  {
    id: 'outils',
    title: 'Les autres outils : Carousel, extension Chrome, réglages',
    blocks: [
      p('Ces outils sont périphériques : ils n\'interviennent pas dans la prospection par email, mais deux d\'entre eux alimentent la base ou le contenu.'),
      h('IA Carousel'),
      p('Ce module génère un carrousel LinkedIn à partir d\'un sujet : on décrit son activité et son secteur, on écrit un sujet ou on demande des idées à l\'IA, on choisit la langue (français, anglais, espagnol ou hébreu), puis on retouche le script écrit par l\'IA (titre et contenu de chaque page) avant la mise en forme et l\'export en PDF. C\'est un outil de contenu pour les réseaux sociaux, sans lien avec les contacts du CRM.'),
      h('Maintenance et réglages'),
      ul(
        '**Backend Cloud** : la connexion à la base de données Supabase. À ne pas modifier sans raison : une erreur coupe l\'accès à toutes les données.',
        '**Identité de marque** : le logo affiché dans le menu.',
        '**Email Engine** : les quatre identifiants EmailJS (clé publique, Service ID, Template ID, jeton d\'accès) qui rendent l\'envoi possible. Ils sont mémorisés dans le navigateur puis dans la base, de sorte qu\'un autre poste les retrouve après synchronisation. Si les envois échouent, c\'est le premier endroit à contrôler.',
        '**Guide utilisateur** : un mode d\'emploi intégré en neuf rubriques. Il date d\'avant l\'écran Réponses et promet une synchronisation de calendrier qui n\'existe pas ; ce manuel le remplace.',
      ),
      p('Deux modules existent dans le code sans apparaître dans le menu : IA Voice (assistant vocal) et Studio (retouche de photos de profil). Ils ne sont pas accessibles aujourd\'hui.'),
    ],
  },
  {
    id: 'limites',
    title: 'Limites connues et bonnes habitudes',
    blocks: [
      p('Quelques habitudes suffisent pour que le CRM reste fiable, et elles ne demandent que quelques minutes par campagne.'),
      h('Les habitudes à prendre'),
      ol(
        '**Laisser l\'onglet ouvert** pendant tout l\'envoi d\'une campagne ou d\'une relance, sans mise en veille de l\'ordinateur.',
        '**Importer les réponses** avec l\'écran Réponses après chaque vague d\'emails : c\'est lui qui renseigne l\'historique, les statuts et les désinscriptions.',
        '**Relancer depuis l\'écran À relancer** une fois les réponses importées, avec un délai adapté (7 jours par défaut).',
        '**Passer à « Contacted »** les contacts à qui l\'on écrit depuis l\'onglet Email d\'une fiche : seuls les envois de campagne et de relance le font automatiquement.',
        '**Qualifier la campagne** une fois les réponses importées, puis la terminer, pour qu\'Analytics et l\'export de rapport disent vrai.',
        '**Vérifier l\'aperçu d\'un import CSV** avant de valider, et lancer Doublons après une série d\'ajouts depuis l\'extension.',
      ),
      h('Les limites à connaître'),
      ul(
        'Pas d\'envoi programmé ni de séquence automatique de relances : chaque envoi est lancé à la main, navigateur ouvert.',
        'Pas de lien de désinscription dans les emails : une personne qui demande à ne plus recevoir de messages doit être marquée « Désinscrit » à la main ou par l\'import des réponses.',
        'Le suivi d\'ouverture est indicatif, jamais une preuve de lecture ni de non-lecture.',
        'Les compteurs de la liste des campagnes (envoyés, ouverts, réponses) ne sont pas fiables : se fier à l\'historique des emails et à l\'export.',
        'L\'écran À relancer ne connaît une réponse que si elle a été importée : sans import, quelqu\'un qui a répondu par mail peut être relancé par erreur.',
        'Supprimer un contact efface aussi son historique, ses emails et ses affaires : préférer la fusion.',
        'La recherche des listes ne porte que sur le nom et la société.',
        'L\'accès au CRM n\'est pas protégé par un mot de passe propre à l\'application : point de sécurité volontairement reporté pour l\'instant.',
      ),
      h('En cas de problème'),
      p('Un envoi qui échoue renvoie vers Maintenance et le bloc Email Engine. Un contact en double renvoie vers l\'écran Doublons. Une base qui paraît vide ou incomplète doit être signalée à Philippe avant toute suppression : des sauvegardes de la base existent.'),
    ],
  },
];

const renderInline = (s: string): React.ReactNode[] =>
  s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={i} className="font-bold text-slate-900">{part.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{part}</React.Fragment>);

const blockText = (b: Block): string => {
  switch (b.t) {
    case 'p': case 'h': return b.text;
    case 'ul': case 'ol': return b.items.join(' ');
    case 'table': return [...b.head, ...b.rows.flat()].join(' ');
  }
};

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const UserManual: React.FC = () => {
  const [query, setQuery] = useState('');

  const visible = useMemo(() => {
    const q = norm(query.trim());
    if (!q) return SECTIONS;
    return SECTIONS.filter(s => norm(s.title + ' ' + s.blocks.map(blockText).join(' ')).includes(q));
  }, [query]);

  const scrollTo = (id: string) =>
    document.getElementById(`manuel-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="space-y-6 p-2 pb-20">
      <div className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm">
        <h3 className="text-2xl font-black uppercase italic tracking-tighter text-slate-900">Manuel d'utilisation</h3>
        <p className="text-xs text-slate-500 mt-2 max-w-2xl">
          Ce que fait chaque écran du CRM, et comment s'en servir. Dernière mise à jour : 15 novembre 2026.
          Les chiffres cités dans ce manuel datent de cette journée.
        </p>
        <div className="relative mt-5 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Chercher dans le manuel (relance, doublon, import…)"
            className="w-full border border-slate-200 rounded-xl py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {visible.map(s => (
            <button
              key={s.id}
              onClick={() => scrollTo(s.id)}
              className="px-3 py-1.5 rounded-full border border-slate-200 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
            >
              {s.title.split(' : ')[0]}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 && (
        <div className="bg-white p-8 rounded-[32px] border border-slate-200 text-sm text-slate-500">
          Aucune rubrique ne correspond à « {query} ».
        </div>
      )}

      {visible.map(s => (
        <section
          key={s.id}
          id={`manuel-${s.id}`}
          className="bg-white p-8 rounded-[32px] border border-slate-200 shadow-sm scroll-mt-4"
        >
          <h4 className="text-lg font-black text-slate-900">{s.title}</h4>
          <div className="mt-4 space-y-3 text-sm text-slate-700 leading-relaxed max-w-3xl">
            {s.blocks.map((b, i) => {
              if (b.t === 'p') return <p key={i}>{renderInline(b.text)}</p>;
              if (b.t === 'h') return <h5 key={i} className="pt-3 text-xs font-black uppercase tracking-wide text-slate-500">{b.text}</h5>;
              if (b.t === 'ul') return (
                <ul key={i} className="list-disc pl-5 space-y-1.5">{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ul>
              );
              if (b.t === 'ol') return (
                <ol key={i} className="list-decimal pl-5 space-y-1.5">{b.items.map((it, j) => <li key={j}>{renderInline(it)}</li>)}</ol>
              );
              return (
                <div key={i} className="overflow-x-auto">
                  <table className="w-full text-left text-xs border border-slate-200 rounded-xl">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>{b.head.map((c, j) => <th key={j} className="p-2 font-black">{c}</th>)}</tr>
                    </thead>
                    <tbody>
                      {b.rows.map((r, j) => (
                        <tr key={j} className="border-t border-slate-100">
                          {r.map((c, k) => <td key={k} className={`p-2 align-top ${k === 0 ? 'font-bold text-slate-900' : ''}`}>{c}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

export default UserManual;
