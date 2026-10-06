# Nexstay CRM

Application web de gestion de conciergerie locative. Elle tourne entièrement dans le navigateur, sans serveur : les données restent dans le `localStorage`.

## Lancer

- **En ligne** : `https://<votre-site>/crm/`. Le CRM est publié avec le site, sous `/crm/`, et exclu de l'indexation.
- **En local** : ouvrir `crm/index.html` dans le navigateur. Les bibliothèques PDF viennent de cdnjs, donc une connexion est nécessaire au premier lancement.
- **Application de bureau (PWA)** : depuis la version en ligne, utiliser le bouton « Installer » dans la barre d'adresse (Chrome / Edge). Le service worker garde l'application disponible hors ligne.

Compte par défaut : `admin` / `admin@nexstay.tn`. Le changement du mot de passe est demandé à la première connexion.

## Reprise des données existantes

Dans **Sauvegarde → Importer**, choisir le fichier JSON de l'ancienne version (`nexstay_backup.json`). Ce format est repris tel quel. Les mots de passe en clair sont remplacés par une empreinte SHA-256 salée dès l'import.

## Structure

| Fichier | Rôle |
|---|---|
| `index.html` | Structure, écran de connexion, icônes SVG |
| `css/crm.css` | Thème terracotta, thème sombre, mise en page responsive |
| `js/core.js` | Utilitaires, stockage (`Store`), authentification (`Auth`), composants (`UI`) |
| `js/calc.js` | Calculs : CA proratisé, occupation, commissions, charges, conflits |
| `js/pdf.js` | Contrats, rapports, reçus PDF et export iCal |
| `js/sync.js` | Synchronisation multi-postes via un Gist GitHub privé |
| `js/views.js` | Les écrans |
| `js/app.js` | Démarrage, connexion, navigation |

## Règles de calcul

- Une réservation est comptée à sa **date d'arrivée**. Les **nuits** et le **CA** d'un séjour à cheval sur deux mois sont répartis au prorata.
- Les réservations **annulées** n'entrent ni dans le CA ni dans l'occupation.
- Occupation = nuits réservées / (jours de la période × logements).
- Charges : *mensuel* = montant × mois, *par réservation* = montant × arrivées.
- Reversement = CA − commission − charges. La déduction des charges se désactive dans Paramétrage.

## Synchronisation entre plusieurs postes

1. Sur GitHub, créer un *fine-grained token* avec la seule permission **Gists (read/write)**.
2. Dans **Sauvegarde → Synchronisation cloud**, coller le jeton, puis cliquer sur **Envoyer**. Un Gist privé est créé et son identifiant est rempli automatiquement.
3. Sur l'autre poste, saisir le même jeton et le même identifiant de Gist, puis cliquer sur **Récupérer**.
4. Option « automatique » : les données sont envoyées après chaque modification et récupérées au démarrage si la version distante est plus récente.
