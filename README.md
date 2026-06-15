# Angular mat calandar

Calendrier au style material design de angular.
Traduction automatique celons la **langue du navigateur.**

# Information

- Compatible Angular 22
- Compatible et conçu pour Angular material
- Accessible via aria, naviguation et actions par le clavier

# Attributs en commun
- `events`: Liste des evenements à mettre sur le calandrier
- `specialEvents`: Liste des evenements spécials (vacances, noel, jour de l'an...)
- `configTheme`: Configuration du theme par defaut pour actualiser les les couleurs des events defini dans le groupe
- `sidebarConfig`: Configuration de la sidebar
- `groups`: Liste des groupes d'event pour personnaliser la couleur et / ou les regrouper
- `monthsDisabled`: Masquer des mois (1 => janvier 12 => decembre)
- `intervalDisabled`: Liste des intervals de jours a désactiver
- `daysDisabled`: Liste des jours à désactiver
- `customMatMenu`: Permet d'utiliser un menu contextuel personnalisé

## Attributs boolean
- `matRippleDisabled`: désactiver l'effet ripple
- `weekendDisabled`: Masquer le weekend (samedi et dimanche)
- `mondayFirst`: Faire commencer le calendrier par lundi sinon dimanche
- `daysOfWeekDisabled`: Désactiver des jours de la semaine (0 => dimanche, 6 => lundi)
- `useAmPm`: Afficher les heures en AM / PM
- `readonly`: Met le calandrier en lecture seul
- `readonlyPast`: Met le calendrier en lecture seul sur le passé
- `loading`: Affiche un spinner par dessus le corps du calendrier
- `hideNavYearBtn`: Masquer les boutons pour naviguer d'une année
- `showBtnAdd`: Afficher le bouton ajouter un nouvelle event

# Par mois

## Attributs
- `month`: mois à afficher (REQUIS) (1 - 12)
- `year`: Année du mois à afficher (REQUIS)

## Events
- `contextClicked`: Event click mat menu contextuel par defaut
- `eventClickJour`: Event click sur le jour
- `eventClickEvent`: Event click sur un évènement
- `eventCreated`: Event drag pour créer un event
- `eventUpdated`: Event drag and drop ou resize d'un event
- `btnAddClicked`: Event click sur bouton ajouter un nouvelle event

## Navigation via clavier
- `TAB`: parcourir le composant
- `ALT + FLECHE BAS`: parcourir les events d'un jour
- `CTRL + FLECHE HAUT`: Revenir sur le jour
- `PageUp / PageDown`: Avancer ou reculer d'un mois
- `CTRL + PageUp / PageDown`: Avancer ou reculer d'un an

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

# Par semaine

## Attributs
- `dateReference`: Affiche la semaine entière a partir de cette date (REQUIS)
- `hourMin`: Heure début du calendrier (0 - 23)
- `hourMax`: Heure de fin du calandrier (0 - 23)

## Events
- `contextClicked`: Event click mat menu contextuel par defaut
- `timeSlotClicked`: Event click sur une heure du calendrier
- `eventClicked`: Event click sur un évènement
- `dayClicked`: Event click sur un jour, liste les events inclus dans le jour
- `eventUpdated`: Event drag and drop ou resize d'un event
- `eventCreated`: Event drag pour créer un event
- `btnAddClicked`: Event click sur bouton ajouter un nouvelle event

## Navigation via clavier
- `TAB`: parcourir le composant
- `FLECHES`: Parcourir les heures et jours du composant 
- `PageUp / PageDown`: Avancer ou reculer d'une semaine
- `CTRL + PageUp / PageDown`: Avancer ou reculer d'un mois

### Creation
- `SHIFT + FLECHES` puis `Entrer` pour valider

### Modifier date interval
- `CTRL + FLECHE DROITE`: modifier date fin
- `CTRL + SHIFT + FLECHE GAUCHE`: modifier date de début

### Déplacer l'event
- `SHIFT + FLECHES`: déplacer l'event

## Exemple
```html
<script>
    let date = new Date();
</script>

<jp-mat-week-calandar [dateReference]="date" useAmPm hourMin="9" />
```

# Agenda

## Attributs
- `month`: mois à afficher (REQUIS) (1 - 12)
- `year`: Année du mois à afficher (REQUIS)

## Events
- `eventClicked`: Event click sur un évènement
- `contextClicked`: Event click mat menu contextuel par defaut
- `btnAddClicked`: Event click sur bouton ajouter un nouvelle event

# Menu contextuel et directive

## Directive
- `[jpCalandarAction]`: Lier au calendrier conserné (REQUIS)
- `[event]`: Event sur lequel le menu est ouvert (REQUIS)

Permet de désactiver automatiquement un `<button>`, `<div>` ou `<a>` si  
le composant est en `readonly`, `readonlyPast` ou l'event est en `readonly`

**Note:** l'attribut `aria-disabled` est géré automatiquement.

## Menu contextuel
`let-ev="eventCal"`: Permet d'avoir l'event sur lequel le menu s'ouvre.  
Par defaut, il existe un menu avec les actions Modifier et Supprimer.  
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
