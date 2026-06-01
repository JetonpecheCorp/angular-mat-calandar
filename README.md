# Angular mat calandar

Calendrier au style material design de angular.
Traduction automatique celons la **langue du navigateur.**

# Information

- Compatible Angular 21
- Compatible et conçu pour Angular material

# Par mois

## Attribut
- `month`: mois à afficher (REQUIS) (1 - 12)
- `year`: Année du mois à afficher (REQUIS)
- `matRippleDisabled`: désactiver l'effet ripple sur les cellules des jours
- `events`: Liste des evenements à mettre sur le calandrier
- `weekendDisabled`: Masquer le weekend (samedi et dimanche)
- `mondayFirst`: Faire commencer le calendrier par lundi sinon dimanche
- `daysOfWeekDisabled`: Désactiver des jours de la semaine (0 => dimanche, 6 => lundi)
- `daysDisabled`: Liste des jours à désactiver
- `useAmPm`: Afficher les heures en AM / PM
- `readonly`: Met le calandrier en lecture seul
- `loading`: Affiche un spinner par dessus le corps du calendrier
- `intervalDisabled`: Liste des intervals de jours a désactiver
- `monthsDisabled`: Masquer des mois (1 => janvier 12 => decembre)
- `hideNavYearBtn`: Masquer les boutons pour naviguer d'une année
- `showBtnAdd`: Afficher le bouton ajouter un nouvelle event

## events
- `eventClickJour`: Event click sur le jour
- `eventClickEvent`: Event click sur un évènement
- `eventCreated`: Event drag pour créer un event
- `eventUpdated`: Event drag and drop ou resize d'un event
- `btnAddClicked`: Event click sur bouton ajouter un nouvelle event

## Exemple
```html
<script>
    let date = new Date();
</script>

<jp-mat-month-calandar [month]="date.getMonth() + 1" [year]="date.getFullYear()" useAmPm hourMin="9" />
```

# Par semaine

## Attribut
- `dateReference`: Affiche la semaine entière a partir de cette date (REQUIS)
- `events`: Liste des evenements à mettre sur le calandrier
- `specialEvents`: Liste des evenements spécials (vacances, noel, jour de l'an...)
- `mondayFirst`: Faire commencer le calendrier par lundi sinon dimanche
- `hourMin`: Heure début du calendrier (0 - 23)
- `hourMax`: Heure de fin du calandrier (0 - 23)
- `daysOfWeekDisabled`: Jours de la semaine à masquer
- `weekendDisabled`: Masquer le weekend
- `useAmPm`: Afficher les heures en AM / PM
- `loading`: Affiche un spinner par dessus le corps du calendrier
- `readonly`: Met le calandrier en lecture seul
- `matRippleDisabled`: Désactiver l'effet ripple
- `hideNavYearBtn`: Masquer les boutons pour naviguer d'un mois
- `showBtnAdd`: Afficher le bouton ajouter un nouvelle event

## events
- `timeSlotClicked`: Event click sur une heure du calendrier
- `eventClicked`: Event click sur un évènement
- `dayClicked`: Event click sur un jour, liste les events inclus dans le jour
- `eventUpdated`: Event drag and drop ou resize d'un event
- `eventCreated`: Event drag pour créer un event
- `btnAddClicked`: Event click sur bouton ajouter un nouvelle event

## Exemple
```html
<script>
    let date = new Date();
</script>

<jp-mat-week-calandar [dateReference]="date" useAmPm hourMin="9" />
```
