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
- `intervalDisabled`: Liste des intervals de jours a désactiver
- `monthsDisabled`: Masquer des mois (1 => janvier 12 => decembre)
- `eventClickJour`: Event click sur le jour
- `eventClickEvent`: Event click sur un évènement
- `eventCreated`: Event drag pour créer un event
- `eventUpdated`: Event drag and drop ou resize d'un event 

## Exemple
```html
<script>
    let date = new Date();
</script>

<jp-mat-month-calandar [month]="date.getMonth() + 1" [year]="date.getFullYear()" useAmPm hourMin="9" />
```

# Par semaine

## Attribut
- `dateReference`: Affiche la semaine entière a partir de cette date
- `events`: Liste des evenements à mettre sur le calandrier
- `specialEvents`: Liste des evenements spécials (vacances, noel, jour de l'an...)
- `mondayFirst`: Faire commencer le calendrier par lundi sinon dimanche
- `hourMin`: Heure début du calendrier (0 - 23)
- `hourMax`: Heure de fin du calandrier (0 - 23)
- `daysOfWeekDisabled`: Jours de la semaine à masquer
- `weekendDisabled`: Masquer le weekend
- `useAmPm`: Afficher les heures en AM / PM
- `matRippleDisabled`: Désactiver l'effet ripple

- `timeSlotClicked`: Event click sur une heure du calendrier
- `eventClicked`: Event click sur un évènement
- `dayClicked`: Event click sur un jour, liste les events inclus dans le jour
- `eventUpdated`: Event drag and drop ou resize d'un event
- `eventCreated`: Event drag pour créer un event

## Exemple
```html
<script>
    let date = new Date();
</script>

<jp-mat-week-calandar [dateReference]="date" useAmPm hourMin="9" />
```
