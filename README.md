# Angular mat calandar
Calendrier au style `material design` d'angular.  
Traduction automatique selons la **langue du navigateur.**

# Information
- Compatible Angular 22
- Compatible et conçu pour Angular material
- Accessible via les `arias`, voix, navigation et actions par le clavier

# Attributs en commun
- `events` : liste des événements à mettre sur le calendrier
- `specialEvents` : liste des événements spéciaux (vacances, Noël, jour de l'An...)
- `configTheme` : configuration du thème par défaut pour actualiser les couleurs des événements définis dans le groupe
- `sidebarConfig` : configuration de la sidebar
- `groups` : liste des groupes d'événements pour personnaliser la couleur et / ou les regrouper
- `monthsDisabled` : liste des mois à désactiver (1 => janvier, 12 => décembre)
- `hiddenMonths` : liste des mois à masquer (1 => janvier, 12 => décembre)
- `intervalDisabled` : liste des intervalles de jours à désactiver
- `daysDisabled` : liste des jours à désactiver
- `customMatMenu` : permet d'utiliser un menu contextuel personnalisé
- `langue` : permet de définir une traduction (par défaut, la langue du navigateur ; si aucune traduction n'est disponible, l'anglais est utilisé)
    - Langues disponibles : anglais, français, espagnol, italien, allemand et portugais

## Attributs boolean
- `matRippleDisabled` : désactiver l'effet ripple
- `weekendDisabled` : masquer le week-end (samedi et dimanche)
- `mondayFirst` : faire commencer le calendrier par le lundi, sinon le dimanche.
- `daysOfWeekDisabled` : désactiver des jours de la semaine (0 => dimanche, 6 => lundi)
- `useAmPm` : afficher les heures au format AM/PM.
- `readonly` : met le calendrier en lecture seule
- `readonlyPast` : met le calendrier en lecture seule sur le passé
- `loading` : affiche un spinner par-dessus le corps du calendrier
- `hideNavYearBtn` : masquer les boutons pour naviguer d'une année
- `showBtnAdd` : afficher le bouton pour ajouter un nouvel événement

# Événements en commun
- `dayClicked`: événement clic sur un jour, liste les events inclus dans le jour
- `eventClicked`: événement clic sur un évènement
- `contextClicked` : événement de clic sur le menu contextuel par défaut
- `eventCreated` : événement de glisser pour créer un événement
- `eventUpdated` : événement de glisser-déposer ou redimensionnement d'un événement
- `btnAddClicked` : événement de clic sur le bouton pour ajouter un nouvel événement

# Par année

## Attributs
- `year` : année à afficher (REQUIS) (1 - 12)
- `defaultHiddenMonths` : liste des mois à masquer par défaut dans le select (`hiddenMonths` prioritaire)
- `hideSelectMonth` : masquer le select des mois

## Navigation via clavier
- `TAB` : parcourir le composant
- `FLÈCHES` : parcourir les jours du composant 
- `ALT + FLÈCHE BAS` : parcourir les événements d'un jour
- `CTRL + FLÈCHE HAUT` : revenir sur le jour
- `N / P` : avancer ou reculer d'un an

### Création
- `SHIFT + flèches clavier` puis `Entrée` pour valider

### Modifier l'intervalle de date
- `CTRL + FLÈCHE DROITE` : modifier la date de fin
- `CTRL + SHIFT + FLÈCHE GAUCHE` : modifier la date de début

### Déplacer l'événement
- `SHIFT + FLÈCHE DROITE ou GAUCHE` : déplacer l'événement

## Exemple
```html
<script>
    let date = new Date();
</script>

<jp-mat-year-calandar [year]="date.getFullYear()" useAmPm />
```

# Par mois

## Attributs
- `month`: mois à afficher (REQUIS) (1 - 12)
- `year`: Année du mois à afficher (REQUIS)

## Navigation via clavier
- `TAB`: parcourir le composant
- `FLECHES`: Parcourir les jours du composant 
- `ALT + FLECHE BAS`: parcourir les events d'un jour
- `CTRL + FLECHE HAUT`: Revenir sur le jour
- `N / P`: Avancer ou reculer d'un mois
- `SHIFT + N / P`: Avancer ou reculer d'un an

### Creation
- `SHIFT + fleches clavier` puis `Entrer` pour valider

### Modifier date interval
- `CTRL + FLECHE DROITE`: modifier date fin
- `CTRL + SHIFT + FLECHE GAUCHE`: modifier date de début

### Déplacer l'event
- `SHIFT + FLECHE DROITE ou GAUCHE`: deplacer l'event

## Exemple
```html
<script>
    let date = new Date();
</script>

<jp-mat-month-calandar [month]="date.getMonth() + 1" [year]="date.getFullYear()" useAmPm hourMin="9" />
```

# Par semaine et par jour

## Attributs
- `dateReference` : affiche la semaine entière à partir de cette date (REQUIS)
- `hourMin` : heure de début du calendrier (0-23)
- `hourMax` : heure de fin du calendrier (0-23)

## Événements
- `timeSlotClicked` : événement clic sur une heure du calendrier

## Navigation via le clavier
- `TAB` : parcourir le composant
- `FLÈCHES` : parcourir les heures et jours du composant 
- `N / P` : avancer ou reculer d'une semaine (un jour pour le composant par jour)
- `SHIFT + N / P` : avancer ou reculer d'un mois

### Création
- `SHIFT + FLÈCHES` puis `Entrer` pour valider

### Modifier date interval
- `CTRL + FLÈCHE DROITE` : modifier la date de fin
- `CTRL + SHIFT + FLÈCHE GAUCHE` : modifier la date de début

### Déplacer l'événement
- `SHIFT + FLÈCHES` : déplacer l'événement

## Exemple
```html
<script>
    let date = new Date();
</script>

<jp-mat-week-calandar [dateReference]="date" useAmPm hourMin="9" />
<jp-mat-day-calandar [dateReference]="date" useAmPm hourMin="9" />
```

# Agenda

## Attributs
- `month` : mois à afficher (REQUIS) (1-12)
- `year` : année du mois à afficher (REQUIS)

## Events
`dayClicked`, `eventCreated` et `eventUpdated` non disponibles

# Menu contextuel et directive

## Directive
- `[jpCalandarAction]` : lier au calendrier concerné (REQUIS)
- `[event]` : événement sur lequel le menu est ouvert (REQUIS)

Permet de désactiver automatiquement un `<button>`, `<div>` ou `<a>` si  
le composant est en `readonly`, `readonlyPast` ou l'événement est en `readonly`

**Note:** l'attribut `aria-disabled` est géré automatiquement.

## Menu contextuel
`let-ev="eventCal"`: Permet d'avoir l'événement sur lequel le menu s'ouvre.  
Par défaut, il existe un menu avec les actions Modifier et Supprimer.  
Ils s'activent selon le `readonly` ou `readonlyPast`.

## Exemple
```html
<jp-mat-week-calandar #calendrier
                      [dateReference]="date" 
                      [customMatMenu]="userMenu" />

<mat-menu #userMenu="matMenu">
    <ng-template matMenuContent let-ev="eventCal">
        
        <button [jpCalandarAction]="calendrier" [event]="ev" (click)="click(ev)">...</button>

        <a [jpCalandarAction]="calendrier" [event]="ev" (click)="click(ev)">...</a>

        <div [jpCalandarAction]="calendrier" [event]="ev" (click)="click(ev)">...</div>
    </ng-template>
</mat-menu>
```
