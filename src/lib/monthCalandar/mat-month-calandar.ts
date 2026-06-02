import { booleanAttribute, ChangeDetectionStrategy, Component, computed, ElementRef, HostListener, inject, input, model, OnInit, output, signal } from '@angular/core';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EventCalandar } from '../../models/EventCalandar';
import { DateCalendrier } from '../../models/DateCalandar';
import { DatePipe } from '@angular/common';
import {MatRippleModule} from '@angular/material/core';
import {MatMenuModule} from '@angular/material/menu';
import { DragDropModule, CdkDragDrop } from '@angular/cdk/drag-drop';
import { DateSpecialEvent } from '../../public-api';
import { DateInterval } from '../../models/DateInterval';
import { DateCalandarDisabled } from '../../models/DateCalandarDisabled';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

interface EventPositionne {
    event: EventCalandar;
    jourDebutIndex: number; /* de 0 à (nbColonnes - 1) */
    dureeJours: number;
    ligne: number;          /* Position verticale (0, 1, 2...) */
}

interface SemaineCalendrier {
    jours: DateCalendrier[];
    eventsPositionnes: EventPositionne[];
}

@Component({
  selector: 'jp-mat-month-calandar',
  imports: [MatProgressSpinnerModule, DragDropModule, MatMenuModule, MatRippleModule, DatePipe, MatToolbarModule, MatButtonModule, MatIconModule],
  templateUrl: './mat-month-calandar.html',
  styleUrl: './mat-month-calandar.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MatMonthCalandar implements OnInit
{
    events = input<EventCalandar[]>();
    specialEvents = input<DateSpecialEvent[]>([]);

    /** 1 => January, 12 => december */
    mois = model.required<number>({ alias: "month" });
    annee = model.required<number>({ alias: "year" });
    useAmPm = input(false, { transform: booleanAttribute });
    weekendDisabled = input(false, { transform: booleanAttribute });
    mondayFirst = input(false, { transform: booleanAttribute });
    matRippleDisabled = input(false, { transform: booleanAttribute });
    hideNavYearBtn = input(false, { transform: booleanAttribute });
    showBtnAdd = input(false, { transform: booleanAttribute });
    readonly = input(false, { transform: booleanAttribute });
    loading = input(false, { transform: booleanAttribute });

    /** 0 => Sunday, 6 => Monday */
    daysOfWeekDisabled = input<number[]>([]);

    /** 1 => January, 12 => december */
    monthsDisabled = input<number[]>([]);
    daysDisabled = input<Date[]>();

    /** Disabled interval date */
    intervalsDisabled = input<DateCalandarDisabled[]>([]);

    eventClickJour = output<DateCalendrier>({ alias: "dayClicked" });
    eventClickEvent = output<EventCalandar>({ alias: "eventClicked" });
    eventUpdated = output<EventCalandar>();
    eventCreated = output<DateInterval>();
    btnAddClicked = output();

    protected estPetitEcran = signal(false);
    protected overrideRipple = signal(false);
    protected hoveredEvent = signal<EventCalandar | null>(null);
    protected dateRetourFocus = signal<number | null>(null);
    protected trad = signal({
        plus: "more", 
        aujourdhui: "Today", 
        ajouter: "Add new",
        ariaPrecedent: "Previous", 
        ariaSuivant: "Next", 
        ariaAnneePrecedente: "Previous year", 
        ariaAnneeSuivante: "Next year", 
        ariaMenuMois: "Change month menu",
        ariaMenuAnnee: "Change year menu",
        ariaEvenement: "Event:", 
        ariaCreer: "Create event on",
        chargement: "Loading",
        aideCreerEtendre: " (Shift plus arrows to extend)",
        aideCreerValider: " (Enter to validate)",
        aideDescendre: ". Alt plus down arrow to select an event",
        aideEventModif: " (Editing in progress. Enter to validate, Escape to cancel)",
        aideEventNormal: " (Shift plus arrows to move. Ctrl plus arrows to resize end. Ctrl plus Shift plus arrows to resize start. Alt plus up arrow to return to day)",
        aideNavMois: ". PageUp or PageDown to change month. Ctrl plus Page to change year"
    });

    private readonly langueNavigateur = navigator.language || "en-US";
    
    private dernierTouchTime = 0;
    protected dragCreationEnCours = signal(false);
    protected dateDebutCreation = signal<Date | null>(null);
    protected dateFinCreation = signal<Date | null>(null);
    protected previewResize = signal<{ eventId: any, startDate: Date, endDate: Date } | null>(null);
    protected zoneNavigationActive = signal<'left' | 'right' | null>(null);
    protected bulleSurvolee = signal<'left' | 'right' | null>(null);

    private el = inject(ElementRef);
    private navigationInterval: any = null;

    protected displayEvents = computed(() => 
    {
        const preview = this.previewResize();
        const baseEvents = this.events() ?? [];

        if (!preview)
            return baseEvents;

        // Si on est en train de redimensionner, on remplace temporairement les dates de l'événement concerné
        return baseEvents.map(ev => 
            ev.id == preview.eventId ? { ...ev, startDate: preview.startDate, endDate: preview.endDate } : ev
        );
    });

    protected nomMois = computed(() =>
    {
        const DATE = new Date(this.annee(), this.mois() - 1, 1);
        return new Intl.DateTimeFormat(this.langueNavigateur, { month: 'long' }).format(DATE);
    });

    protected nbColonnes = computed(() => 7 - this.joursAExclure().length);
    protected maxLignesVisibles = computed(() => this.estPetitEcran() ? 3 : 4); 

    protected listeDate = computed(() =>
    {
        let dateFinMois = new Date();

        dateFinMois.setMonth(this.mois());
        dateFinMois.setFullYear(this.annee());
        dateFinMois.setDate(0);

        if(dateFinMois.getMonth() == 11)
            dateFinMois.setFullYear(this.annee());

        let dateDebut = new Date(this.annee(), this.mois() - 1, 1);

        return this.Generer(dateDebut, dateFinMois);
    });

    protected listeNomSemaine = computed(() => 
    {
        let liste = [];

        // debuter par lundi ou dimanche ?
        const JOUR_DEBUT = this.mondayFirst() ? 5 : 4; 
        const DATE_REF = new Date(2025, 4, JOUR_DEBUT); 
        
        const shortFormatter = new Intl.DateTimeFormat(this.langueNavigateur, { weekday: 'short' });
        const longFormatter = new Intl.DateTimeFormat(this.langueNavigateur, { weekday: 'long' });

        for (let i = 0; i < 7; i++) 
        {
            const dateTest = new Date(DATE_REF);
            dateTest.setDate(DATE_REF.getDate() + i);
            const dayIndex = dateTest.getDay();

            if (this.joursAExclure().includes(dayIndex)) 
                continue;

            liste.push({
                index: dayIndex,
                reduit: shortFormatter.format(dateTest).toLowerCase().replace('.', ''),
                normal: longFormatter.format(dateTest).toLowerCase()
            });
        }

        return liste;
    });

    protected listeSemaines = computed<SemaineCalendrier[]>(() => 
    {
        const joursPlats = this.listeDate(); 
        const nbCols = this.nbColonnes();
        const semaines: SemaineCalendrier[] = [];

        for (let i = 0; i < joursPlats.length; i += nbCols) 
        {
            const joursSemaine = joursPlats.slice(i, i + nbCols);
            let eventsPositionnes: EventPositionne[] = [];
            let slotsOccuppes: { [jour: number]: number[] } = {};

            // 1. Récupérer tous les événements uniques de cette semaine
            const setEvents = new Set<EventCalandar>();
            joursSemaine.forEach(j => 
            {
                j.listeEvent.forEach(ev => setEvents.add(ev));
            });

            // 2. Trier : on place en haut les plus anciens et les plus longs
            const eventsTries = Array.from(setEvents).sort((a, b) => 
            {
                const startDiff = a.startDate.getTime() - b.startDate.getTime();

                if (startDiff != 0) 
                    return startDiff;

                return (b.endDate.getTime() - b.startDate.getTime()) - (a.endDate.getTime() - a.startDate.getTime());
            });

            // 3. Calculer les slots
            eventsTries.forEach(ev => {
                // Trouver les index de début et fin DANS LA SEMAINE
                const startIdx = joursSemaine.findIndex(j => this.EstMemeJour(j.date, ev.startDate));
                const actualStartIdx = startIdx === -1 ? 0 : startIdx; 

                const endIdx = joursSemaine.findIndex(j => this.EstMemeJour(j.date, ev.endDate));
                const actualEndIdx = endIdx === -1 ? (nbCols - 1) : endIdx; 

                const duree = (actualEndIdx - actualStartIdx) + 1;

                // Trouver la première ligne libre
                let ligne = 0;
                let ligneLibre = false;
                while (!ligneLibre) {
                    ligneLibre = true;
                    for (let j = actualStartIdx; j <= actualEndIdx; j++) {
                        if (!slotsOccuppes[j]) slotsOccuppes[j] = [];
                        if (slotsOccuppes[j].includes(ligne)) {
                            ligneLibre = false;
                            ligne++;
                            break;
                        }
                    }
                }

                // Réserver les slots pour ces jours
                for (let j = actualStartIdx; j <= actualEndIdx; j++) {
                    if (!slotsOccuppes[j]) slotsOccuppes[j] = [];
                    slotsOccuppes[j].push(ligne);
                }

                eventsPositionnes.push({ event: ev, jourDebutIndex: actualStartIdx, dureeJours: duree, ligne: ligne });
            });

            semaines.push({ jours: joursSemaine, eventsPositionnes });
        }
        return semaines;
    });

    protected listeMoisTraduit = computed(() => 
    {
        const FORMATEUR = new Intl.DateTimeFormat(this.langueNavigateur, { month: 'long' });
        
        return Array.from({ length: 12 }, (_, i) => 
        {
            return {
                id: i + 1,
                nom: FORMATEUR.format(new Date(2024, i, 1))
            };
        })
        .filter(x => !this.monthsDisabled().includes(x.id));
    });

    protected listeAnnee = computed(() => 
    {
        const ANNEE_REFERENCE = this.annee();

        const ANNEE_DEBUT = ANNEE_REFERENCE - 50;
        const ANNEE_FIN = ANNEE_REFERENCE + 50;
        
        return Array.from({ length: (ANNEE_FIN - ANNEE_DEBUT) + 1 }, (_, i) => ANNEE_DEBUT + i);
    });

    private joursAExclure = computed(() => 
    {
        const A_MASQUER = new Set(this.daysOfWeekDisabled());

        if (this.weekendDisabled())
        {
            A_MASQUER.add(0);
            A_MASQUER.add(6);
        }

        return Array.from(A_MASQUER);
    });

    ngOnInit(): void 
    {
        this.onResize();
        const LANGUE = this.langueNavigateur.split('-')[0];
        
        const DICT_TRADUCTION: Record<string, any> = {
            'fr': { 
                plus: "de plus", aujourdhui: "Aujourd'hui", ajouter: "Ajouter", 
                ariaPrecedent: "Précédent", ariaSuivant: "Suivant", 
                ariaAnneePrecedente: "Année précédente", ariaAnneeSuivante: "Année suivante", 
                ariaMenuMois: "Menu changer le mois", ariaMenuAnnee: "Menu changer l'année", 
                ariaEvenement: "Événement :", ariaCreer: "Créer un événement le",
                chargement: "Chargement en cours",
                aideCreerEtendre: " (Majuscule plus flèches pour étendre)",
                aideCreerValider: " (Entrée pour valider)",
                aideDescendre: ". Alt plus flèche bas pour sélectionner un événement",
                aideEventModif: " (Modification en cours. Entrée pour valider, Échap pour annuler)",
                aideEventNormal: " (Majuscule plus flèches pour déplacer. Ctrl plus flèches pour redimensionner la fin. Ctrl plus Majuscule plus flèches pour redimensionner le début. Alt plus flèche haut pour retourner au jour)",
                aideNavMois: ". Page haut ou Page bas pour changer de mois. Ctrl plus Page haut ou bas pour changer d'année"
            },
            'en': { 
                plus: "more", aujourdhui: "Today", ajouter: "Add new", 
                ariaPrecedent: "Previous", ariaSuivant: "Next", 
                ariaAnneePrecedente: "Previous year", ariaAnneeSuivante: "Next year", 
                ariaMenuMois: "Change month menu", ariaMenuAnnee: "Change year menu", 
                ariaEvenement: "Event:", ariaCreer: "Create event on",
                chargement: "Loading",
                aideCreerEtendre: " (Shift plus arrows to extend)",
                aideCreerValider: " (Enter to validate)",
                aideDescendre: ". Alt plus down arrow to select an event",
                aideEventModif: " (Editing in progress. Enter to validate, Escape to cancel)",
                aideEventNormal: " (Shift plus arrows to move. Ctrl plus arrows to resize end. Ctrl plus Shift plus arrows to resize start. Alt plus up arrow to return to day)",
                aideNavMois: ". PageUp or PageDown to change month. Ctrl plus Page to change year"
            },
            'es': { 
                plus: "más", aujourdhui: "Hoy", ajouter: "Añadir", 
                ariaPrecedent: "Anterior", ariaSuivant: "Siguiente", 
                ariaAnneePrecedente: "Año anterior", ariaAnneeSuivante: "Año siguiente", 
                ariaMenuMois: "Menú cambiar mes", ariaMenuAnnee: "Menú cambiar año", 
                ariaEvenement: "Evento:", ariaCreer: "Crear evento el",
                chargement: "Cargando",
                aideCreerEtendre: " (Mayús más flechas para extender)",
                aideCreerValider: " (Intro para validar)",
                aideDescendre: ". Alt más flecha abajo para seleccionar un evento",
                aideEventModif: " (Modificación en curso. Intro para validar, Escape para cancelar)",
                aideEventNormal: " (Mayús más flechas para mover. Ctrl más flechas para cambiar el final. Ctrl más Mayús más flechas para cambiar el inicio. Alt más flecha arriba para volver al día)",
                aideNavMois: ". Avanzar página o Retroceder página para cambiar de mes. Ctrl más Página para cambiar de año"
            },
            'it': { 
                plus: "in più", aujourdhui: "Oggi", ajouter: "Aggiungi", 
                ariaPrecedent: "Precedente", ariaSuivant: "Successivo", 
                ariaAnneePrecedente: "Anno precedente", ariaAnneeSuivante: "Anno successivo", 
                ariaMenuMois: "Menu cambia mese", ariaMenuAnnee: "Menu cambia anno", 
                ariaEvenement: "Evento:", ariaCreer: "Crea evento il",
                chargement: "Caricamento",
                aideCreerEtendre: " (Maiusc più frecce per estendere)",
                aideCreerValider: " (Invio per confermare)",
                aideDescendre: ". Alt più freccia giù per selezionare un evento",
                aideEventModif: " (Modifica in corso. Invio per confermare, Esc per annullare)",
                aideEventNormal: " (Maiusc più frecce per spostare. Ctrl più frecce per ridimensionare la fine. Ctrl più Maiusc più frecce per ridimensionare l'inizio. Alt più freccia su per tornare al giorno)",
                aideNavMois: ". Pagina Su o Pagina Giù per cambiare mese. Ctrl più Pagina per cambiare anno"
            },
            'de': { 
                plus: "mehr", aujourdhui: "Heute", ajouter: "Hinzufügen", 
                ariaPrecedent: "Vorherige", ariaSuivant: "Nächste", 
                ariaAnneePrecedente: "Vorheriges Jahr", ariaAnneeSuivante: "Nächstes Jahr", 
                ariaMenuMois: "Menü Monat ändern", ariaMenuAnnee: "Menü Jahr ändern", 
                ariaEvenement: "Ereignis:", ariaCreer: "Ereignis erstellen am",
                chargement: "Wird geladen",
                aideCreerEtendre: " (Umschalt plus Pfeiltasten zum Erweitern)",
                aideCreerValider: " (Eingabe zum Bestätigen)",
                aideDescendre: ". Alt plus Pfeiltaste nach unten, um ein Ereignis auszuwählen",
                aideEventModif: " (Bearbeitung läuft. Eingabe zum Bestätigen, Esc zum Abbrechen)",
                aideEventNormal: " (Umschalt plus Pfeiltasten zum Verschieben. Ctrl plus Pfeiltasten zum Ändern des Endes. Ctrl plus Umschalt plus Pfeiltasten zum Ändern des Starts. Alt plus Pfeiltaste nach oben, um zum Tag zurückzukehren)",
                aideNavMois: ". Bild auf oder Bild ab, um den Monat zu ändern. Strg plus Bild, um das Jahr zu ändern"
            },
            'pt': { 
                plus: "mais", aujourdhui: "Hoje", ajouter: "Adicionar", 
                ariaPrecedent: "Anterior", ariaSuivant: "Seguinte", 
                ariaAnneePrecedente: "Ano anterior", ariaAnneeSuivante: "Ano seguinte", 
                ariaMenuMois: "Menu mudar mês", ariaMenuAnnee: "Menu mudar ano", 
                ariaEvenement: "Evento:", ariaCreer: "Criar evento em",
                chargement: "Carregando",
                aideCreerEtendre: " (Shift mais setas para estender)",
                aideCreerValider: " (Enter para validar)",
                aideDescendre: ". Alt mais seta para baixo para selecionar um evento",
                aideEventModif: " (Modificação em curso. Enter para validar, Esc para cancelar)",
                aideEventNormal: " (Shift mais setas para mover. Ctrl mais setas para redimensionar o fim. Ctrl mais Shift mais setas para redimensionar o início. Alt mais seta para cima para voltar ao dia)",
                aideNavMois: ". PageUp ou PageDown para mudar de mês. Ctrl mais Page para mudar de ano"
            }
        };

        this.trad.set(DICT_TRADUCTION[LANGUE] || DICT_TRADUCTION['en']);
    }

    protected ScrollVersAnneeActive(): void 
    {
        // le temps que le mat menu existe reelement
        setTimeout(() => 
        {
            const boutonActif = document.querySelector('.year-grid .active-year');
            
            if (boutonActif) 
            {
                boutonActif.scrollIntoView({
                    behavior: "instant",
                    block: "center"
                });
            }
        }, 50);
    }

    protected EstMemeJour(date1: Date, date2: Date): boolean 
    {
        return date1.getDate() === date2.getDate() &&
            date1.getMonth() === date2.getMonth() &&
            date1.getFullYear() === date2.getFullYear();
    }

    protected Precedent(): void 
    {
        let nouveauMois = this.mois() == 1 ? 12 : this.mois() - 1;
        let nouvelleAnnee = this.mois() === 1 ? this.annee() - 1 : this.annee();

        // on continue de reculer quand que le mois est désactivé
        while (this.monthsDisabled().includes(nouveauMois)) 
        {
            nouveauMois = nouveauMois == 1 ? 12 : nouveauMois - 1;

            if (nouveauMois == 12) 
                nouvelleAnnee--;
        }

        this.annee.set(nouvelleAnnee);
        this.mois.set(nouveauMois);
    }

    protected Suivant(): void 
    {
        let nouveauMois = this.mois() == 12 ? 1 : this.mois() + 1;
        let nouvelleAnnee = this.mois() == 12 ? this.annee() + 1 : this.annee();

        // on continue d'avancer quand que le mois est désactivé
        while (this.monthsDisabled().includes(nouveauMois)) 
        {
            nouveauMois = nouveauMois == 12 ? 1 : nouveauMois + 1;
            if (nouveauMois == 1) 
                nouvelleAnnee++;
        }

        this.annee.set(nouvelleAnnee);
        this.mois.set(nouveauMois);
    }

    protected AnneePrecedente(): void 
    {
        this.annee.set(this.annee() - 1);
    }

    protected AnneeSuivante(): void 
    {
        this.annee.set(this.annee() + 1);
    }

    protected AllerAujourdhui(): void 
    {
        let dateJour = new Date();
        this.mois.set(dateJour.getMonth() + 1);
        this.annee.set(dateJour.getFullYear());
    }

    protected ChangerMois(_numeroMois: number): void
    {
        this.mois.set(_numeroMois);
    }

    protected ChangerAnnee(_annee: number): void
    {
        this.annee.set(_annee);
    }

    protected ScrollHorizontal(event: WheelEvent): void 
    {
        const conteneur = event.currentTarget as HTMLElement;

        // On vérifie il on peut scroller
        if (conteneur.scrollWidth > conteneur.clientWidth)
        {
            event.preventDefault();  
            conteneur.scrollLeft += event.deltaY; 
        }
    }

    protected BtnAjouterClicker(): void
    {
        this.btnAddClicked.emit();
    }

    protected ClickEvent(_event: EventCalandar): void
    {   
        this.eventClickEvent.emit(_event);
    }

    protected OnDragStarted(): void 
    {   
        this.hoveredEvent.set(null);
    }

    protected OnDragEnded(): void 
    {
        this.hoveredEvent.set(null);
        this.overrideRipple.set(false);
        this.NettoyerNavigationBulle();
    }

    protected OnEventDragMoved(dragEvent: any): void 
    {
        const clientX = dragEvent.pointerPosition.x;
        const clientY = dragEvent.pointerPosition.y;
        this.GererNavigationBulle(clientX, clientY);
    }

    protected OnEventDropped(dropEvent: CdkDragDrop<DateCalendrier>): void 
    {
        if (dropEvent.previousContainer == dropEvent.container) 
            return;

        const eventObj = dropEvent.item.data as EventCalandar;
        const targetDay = dropEvent.container.data as DateCalendrier;

        // On remet les heures à zéro pour comparer uniquement les jours purs (évite les bugs liés à l'heure d'été/hiver)
        const DATE_DEBUT_SANS_HEURE = new Date(eventObj.startDate.getFullYear(), eventObj.startDate.getMonth(), eventObj.startDate.getDate()).getTime();
        const DATE_CIBLE_SANS_HEURE = new Date(targetDay.date.getFullYear(), targetDay.date.getMonth(), targetDay.date.getDate()).getTime();
        
        // La différence en millisecondes
        let differenceTemps = DATE_CIBLE_SANS_HEURE - DATE_DEBUT_SANS_HEURE;

        if(differenceTemps != 0)
        {
            const nouvelleDateDebut = new Date(eventObj.startDate.getTime() + differenceTemps);
            const nouvelleDateFin = new Date(eventObj.endDate.getTime() + differenceTemps);

            this.eventUpdated.emit({
                id: eventObj.id,
                titre: eventObj.titre,
                description: eventObj.description,
                startDate: nouvelleDateDebut,
                endDate: nouvelleDateFin
            });
        }
    }

    // Vérifie si un jour fait partie de la sélection en cours
    protected EstEnCreation(_date: Date): boolean 
    {
        const debut = this.dateDebutCreation();
        const fin = this.dateFinCreation();
        if (!this.dragCreationEnCours() || !debut || !fin) return false;

        const tDate = new Date(_date.getFullYear(), _date.getMonth(), _date.getDate()).getTime();
        const tDebut = new Date(debut.getFullYear(), debut.getMonth(), debut.getDate()).getTime();
        const tFin = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate()).getTime();

        const min = Math.min(tDebut, tFin);
        const max = Math.max(tDebut, tFin);

        return tDate >= min && tDate <= max;
    }

    protected OnMouseDownCreation(event: MouseEvent | TouchEvent | Event, dateJour: Date, estBloquer: boolean): void 
    {
        if (this.readonly() || estBloquer) 
            return;

        // Anti-Ghost Click Mobile
        if (event.type == 'touchstart') 
            this.dernierTouchTime = Date.now();

        else if (event.type === 'mousedown' && Date.now() - this.dernierTouchTime < 500) 
            return;

        if (event instanceof MouseEvent && event.button != 0) 
            return;

        // ignorer si l'utilisateur essaie d'attraper un événement existant
        const target = event.target as HTMLElement;
        if (target.closest('.event-item') || target.closest('.special-event-indicators-container')) 
            return;

        const clientXDebut = event instanceof MouseEvent ? event.clientX : (event as TouchEvent).touches[0].clientX;
        const clientYDebut = event instanceof MouseEvent ? event.clientY : (event as TouchEvent).touches[0].clientY;

        this.dateDebutCreation.set(dateJour);
        this.dateFinCreation.set(dateJour);
        this.dragCreationEnCours.set(false);

        let aBouge = false;
        let intentionScroll = false;
        let modeDragCreation = false;
        let timeoutAppuiLong: any;

        if (event.type.startsWith('touch')) 
        {
            timeoutAppuiLong = setTimeout(() => {
                if (!aBouge) 
                {
                    modeDragCreation = true;
                    this.dragCreationEnCours.set(true);

                    if (navigator.vibrate) 
                        navigator.vibrate(50);
                }
            }, 350);
        } 
        else 
            modeDragCreation = true;

        const onMouseMove = (_moveEvent: MouseEvent | TouchEvent) => 
        {
            if (intentionScroll) 
                return;

            const moveX = _moveEvent instanceof MouseEvent ? _moveEvent.clientX : _moveEvent.touches[0].clientX;
            const moveY = _moveEvent instanceof MouseEvent ? _moveEvent.clientY : _moveEvent.touches[0].clientY;

            if (Math.abs(moveX - clientXDebut) > 5 || Math.abs(moveY - clientYDebut) > 5)
                aBouge = true;

            if (!modeDragCreation) 
            {
                if (aBouge) 
                {
                    intentionScroll = true;
                    clearTimeout(timeoutAppuiLong);
                    return;
                }
            } 
            else 
            {
                this.GererNavigationBulle(moveX, moveY);

                if (aBouge) 
                    this.dragCreationEnCours.set(true);

                if (_moveEvent.cancelable) 
                    _moveEvent.preventDefault();

                let hoveredCell: HTMLElement | null = null;
                if (_moveEvent instanceof MouseEvent)
                    hoveredCell = (_moveEvent.target as HTMLElement).closest('.day-cell');

                else 
                {
                    const touch = _moveEvent.touches[0];
                    const elementFromPoint = document.elementFromPoint(touch.clientX, touch.clientY);
                    hoveredCell = elementFromPoint ? elementFromPoint.closest('.day-cell') : null;
                }

                if (hoveredCell && hoveredCell.dataset['date']) 
                {
                    let timestamp = parseInt(hoveredCell.dataset['date'], 10);

                    if (!isNaN(timestamp))
                        this.dateFinCreation.set(new Date(timestamp));
                }
            }
        };

        const onMouseUp = () => 
        {
            clearTimeout(timeoutAppuiLong);
            this.NettoyerNavigationBulle();

            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onMouseMove);
            window.removeEventListener('touchend', onMouseUp);

            // CLIC SIMPLE
            if (!intentionScroll) 
            {
                if (!aBouge && !this.dragCreationEnCours()) 
                {
                    let dateCalendrier = this.listeDate().find(x => x.date.getTime() == dateJour.getTime());

                    if (dateCalendrier) 
                        this.eventClickJour.emit(dateCalendrier);
                } 
                // DRAG MULTI-JOURS
                else if (modeDragCreation && aBouge && this.dragCreationEnCours()) 
                {
                    let debut = this.dateDebutCreation();
                    let fin = this.dateFinCreation();

                    if (debut && fin) 
                    {   
                        this.eventCreated.emit({ 
                            start:  new Date(Math.min(debut.getTime(), fin.getTime())), 
                            end: new Date(Math.max(debut.getTime(), fin.getTime()))
                        });
                    }
                }
            }

            this.dragCreationEnCours.set(false);
            this.dateDebutCreation.set(null);
            this.dateFinCreation.set(null);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onMouseMove, { passive: false });
        window.addEventListener('touchend', onMouseUp);
    }

    protected OnResizeStart(_e: MouseEvent | TouchEvent, _eventObj: EventCalandar, _side: 'left' | 'right'): void 
    {
        _e.preventDefault();
        _e.stopPropagation();

        let dateTrouvee = false;
        let finalStartDate = new Date(_eventObj.startDate);
        let finalEndDate = new Date(_eventObj.endDate);

        const onMouseMove = (_moveEvent: MouseEvent | TouchEvent) => 
        {
            if (_moveEvent.cancelable) 
                _moveEvent.preventDefault(); 

            let clientX = _moveEvent instanceof MouseEvent ? _moveEvent.clientX : _moveEvent.touches[0].clientX;
            let clientY = _moveEvent instanceof MouseEvent ? _moveEvent.clientY : _moveEvent.touches[0].clientY;

            this.GererNavigationBulle(clientX, clientY);

            const elementFromPoint = document.elementFromPoint(clientX, clientY);
            let hoveredCell = elementFromPoint ? elementFromPoint.closest('.day-cell') as HTMLElement : null;

            if (hoveredCell && hoveredCell.dataset['date']) 
            {
                let timestamp = parseInt(hoveredCell.dataset['date'], 10);
                if (!isNaN(timestamp)) 
                {
                    let hoveredDate = new Date(timestamp);
                    dateTrouvee = true;

                    if (_side == "left") 
                    {
                        if (hoveredDate.getTime() > _eventObj.endDate.getTime()) 
                            hoveredDate = new Date(_eventObj.endDate);

                        finalStartDate = hoveredDate;
                    } 
                    else 
                    {
                        if (hoveredDate.getTime() < _eventObj.startDate.getTime()) 
                            hoveredDate = new Date(_eventObj.startDate);

                        finalEndDate = hoveredDate;
                    }

                    // actualiser automatiquement le front la barre selon le cuseur
                    this.previewResize.set({
                        eventId: _eventObj.id,
                        startDate: finalStartDate,
                        endDate: finalEndDate
                    });
                }
            }
        };

        const onMouseUp = () => 
        {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
            window.removeEventListener('touchmove', onMouseMove);
            window.removeEventListener('touchend', onMouseUp);
            
            // supprime le fantôme
            this.previewResize.set(null);
            this.NettoyerNavigationBulle();

            // On émet si les dates ont changé
            if (dateTrouvee && (finalStartDate.getTime() != _eventObj.startDate.getTime() || finalEndDate.getTime() != _eventObj.endDate.getTime())) 
            {
                this.eventUpdated.emit({
                    ..._eventObj,
                    startDate: finalStartDate,
                    endDate: finalEndDate
                });
            }
        };

        window.addEventListener('mousemove', onMouseMove, { passive: false });
        window.addEventListener('mouseup', onMouseUp);
        window.addEventListener('touchmove', onMouseMove, { passive: false });
        window.addEventListener('touchend', onMouseUp);
    }

    protected OnDayCellKeydown(event: KeyboardEvent, dateJour: Date, estBloquer: boolean, eventsDuJour: EventCalandar[] = []): void 
    {
        if (event.key == 'Escape') 
        {
            if (this.dragCreationEnCours()) 
            {
                this.AnnulerCreationClavier();
                event.preventDefault();
            }

            return;
        }

        if (['PageUp', 'PageDown'].includes(event.key)) 
        {
            event.preventDefault();

            let nouvelleDate = new Date(dateJour);

            // Avec Majuscule = Année / Sans Majuscule = Mois
            if (event.shiftKey || event.ctrlKey || event.metaKey)
                nouvelleDate.setFullYear(nouvelleDate.getFullYear() + (event.key === 'PageUp' ? -1 : 1));

            else 
            {
                const moisCible = nouvelleDate.getMonth() + (event.key === 'PageUp' ? -1 : 1);
                nouvelleDate.setMonth(moisCible);
                
                // Sécurité : si on passe du 31 Janvier au mois de Février, le JS saute en Mars par défaut. 
                // Cette ligne le force à s'arrêter au 28 (ou 29) Février :
                if (nouvelleDate.getMonth() !== ((moisCible % 12 + 12) % 12))
                    nouvelleDate.setDate(0); 
            }

            // On met à jour le calendrier
            this.mois.set(nouvelleDate.getMonth() + 1);
            this.annee.set(nouvelleDate.getFullYear());

            // On remet instantanément le curseur sur le même jour dans le nouveau mois affiché !
            setTimeout(() => {
                const caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${nouvelleDate.getTime()}"]`) as HTMLElement;
                if (caseJour) caseJour.focus();
            }, 120);

            return;
        }

        if (event.key == 'Enter' || event.key == ' ') 
        {
            event.preventDefault();

            if (this.readonly()) 
                return;

            if (this.dragCreationEnCours()) 
            {
                const debut = this.dateDebutCreation();
                const fin = this.dateFinCreation();
                
                if (debut && fin) 
                {   
                    this.eventCreated.emit({ 
                        start: new Date(Math.min(debut.getTime(), fin.getTime())), 
                        end: new Date(Math.max(debut.getTime(), fin.getTime()))
                    });
                }
                this.AnnulerCreationClavier();
            } 
            else 
            {
                if (estBloquer) 
                    return; 

                let dateCalendrier = this.listeDate().find(x => x.date.getTime() == dateJour.getTime());

                if (dateCalendrier) 
                    this.eventClickJour.emit(dateCalendrier);
            }

            return;
        }

        // creation
        if (event.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) 
        {
            event.preventDefault();
            if (this.readonly()) 
                return;

            if (estBloquer && !this.dragCreationEnCours()) 
                return;

            if (!this.dragCreationEnCours()) 
            {
                this.dragCreationEnCours.set(true);
                this.dateDebutCreation.set(dateJour);
                this.dateFinCreation.set(dateJour);
            }

            let decalage = 0;
            if (event.key == 'ArrowRight') 
                decalage = 1;

            else if (event.key == 'ArrowLeft') 
                decalage = -1;

            else if (event.key == 'ArrowDown') 
                decalage = 7;

            else if (event.key == 'ArrowUp') 
                decalage = -7;

            const dateActuelle = this.dateFinCreation() || dateJour;
            const nouvelleDateFin = new Date(dateActuelle);
            nouvelleDateFin.setDate(nouvelleDateFin.getDate() + decalage);

            this.dateFinCreation.set(nouvelleDateFin);

            const nouveauMois = nouvelleDateFin.getMonth() + 1;
            const nouvelleAnnee = nouvelleDateFin.getFullYear();

            const moisAChange = (nouveauMois != this.mois() || nouvelleAnnee != this.annee());

            if (moisAChange) 
            {
                this.mois.set(nouveauMois);
                this.annee.set(nouvelleAnnee);
            }

            setTimeout(() => 
            {
                const targetCell = this.el.nativeElement.querySelector(`.day-cell[data-date="${nouvelleDateFin.getTime()}"]`) as HTMLElement;

                if (targetCell)
                    targetCell.focus();
                
            }, moisAChange ? 120 : 30);
        }

        if (event.altKey && event.key == 'ArrowDown') 
        {
            event.preventDefault();
            if (eventsDuJour && eventsDuJour.length > 0) 
            {
                this.dateRetourFocus.set(dateJour.getTime());

                // On va chercher le premier événement de ce jour et on lui donne le focus
                const eventElement = this.el.nativeElement.querySelector(`#event-${eventsDuJour[0].id}`) as HTMLElement;

                if (eventElement)
                    eventElement.focus();
            }

            return;
        }
    }

    protected OnEventBlur(eventObj: EventCalandar): void 
    {
        // Si on perd le focus (on clique ailleurs) pendant une modification, on annule
        const preview = this.previewResize();
        if (preview && preview.eventId === eventObj.id) 
        {
            this.previewResize.set(null);
        }
    }

    protected OnEventKeydown(event: KeyboardEvent, eventObj: EventCalandar): void 
    {
        if (event.key == 'Escape') 
        {
            if (this.previewResize()) 
            {
                this.previewResize.set(null);
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }

        if (['PageUp', 'PageDown'].includes(event.key))
        {
            event.preventDefault();
            event.stopPropagation();

            let nouvelleDate = new Date(eventObj.startDate);

            if (event.shiftKey || event.ctrlKey || event.metaKey)
                nouvelleDate.setFullYear(nouvelleDate.getFullYear() + (event.key === 'PageUp' ? -1 : 1));
            else
            {
                const moisCible = nouvelleDate.getMonth() + (event.key === 'PageUp' ? -1 : 1);
                nouvelleDate.setMonth(moisCible);

                if (nouvelleDate.getMonth() !== ((moisCible % 12 + 12) % 12))
                    nouvelleDate.setDate(0);
            }

            this.mois.set(nouvelleDate.getMonth() + 1);
            this.annee.set(nouvelleDate.getFullYear());

            // On libère le focus de l'événement et on le pose sur la case du jour du nouveau mois
            setTimeout(() => {
                const caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${nouvelleDate.getTime()}"]`) as HTMLElement;

                if (caseJour) 
                    caseJour.focus();
            }, 120);

            return;
        }

        if (event.key == 'Enter' || event.key == ' ') 
        {
            event.preventDefault();
            event.stopPropagation();

            const apercu = this.previewResize();
            if (apercu && apercu.eventId === eventObj.id) 
            {
                this.eventUpdated.emit({
                    ...eventObj,
                    startDate: apercu.startDate,
                    endDate: apercu.endDate
                });

                this.previewResize.set(null);
            }
            else 
                this.ClickEvent(eventObj);

            return;
        }

        // 3. Remonter sur la case d'origine (Alt + Flèche Haut)
        if (event.altKey && event.key === 'ArrowUp') 
        {
            event.preventDefault();
            
            // On utilise notre marque-page, ou par défaut le début de l'événement
            const timestamp = this.dateRetourFocus() || new Date(eventObj.startDate.getFullYear(), eventObj.startDate.getMonth(), eventObj.startDate.getDate()).getTime();
            const caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${timestamp}"]`) as HTMLElement;
            
            if (caseJour) 
                caseJour.focus();

            return;
        }

        if (event.key === 'Tab')
        {
            const cible = event.target as HTMLElement;
            const coucheEvenements = cible.closest('.events-foreground-layer');
            
            if (coucheEvenements) 
            {
                const tousLesEvenements = Array.from(coucheEvenements.querySelectorAll('.absolute-event')) as HTMLElement[];
                const indexActuel = tousLesEvenements.indexOf(cible);
                
                // A. Si on est sur le dernier événement de la semaine
                if (!event.shiftKey && indexActuel == tousLesEvenements.length - 1) 
                {
                    event.preventDefault(); 
                    
                    // Retour automatique au jour d'origine !
                    const timestamp = this.dateRetourFocus() || new Date(eventObj.startDate.getFullYear(), eventObj.startDate.getMonth(), eventObj.startDate.getDate()).getTime();
                    const caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${timestamp}"]`) as HTMLElement;
                    if (caseJour) caseJour.focus();
                }

                // B. Si on est sur le premier événement et on recule
                else if (event.shiftKey && indexActuel == 0) 
                {
                    event.preventDefault();
                    
                    // Retour automatique au jour d'origine !
                    const timestamp = this.dateRetourFocus() || new Date(eventObj.startDate.getFullYear(), eventObj.startDate.getMonth(), eventObj.startDate.getDate()).getTime();
                    const caseJour = this.el.nativeElement.querySelector(`.day-cell[data-date="${timestamp}"]`) as HTMLElement;

                    if (caseJour) 
                        caseJour.focus();
                }
            }

            return;
        }

        // 5. Déplacement et Redimensionnement
        let estEnDeplacement = event.shiftKey && !event.ctrlKey && !event.metaKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key);
        let estRedimensionnementFin = (event.ctrlKey || event.metaKey) && !event.shiftKey && ['ArrowLeft', 'ArrowRight'].includes(event.key);
        let estRedimensionnementDebut = (event.ctrlKey || event.metaKey) && event.shiftKey && ['ArrowLeft', 'ArrowRight'].includes(event.key);

        if (estEnDeplacement || estRedimensionnementFin || estRedimensionnementDebut) 
        {
            event.preventDefault();
            event.stopPropagation();

            if (this.readonly() || eventObj.readonly) return;

            const apercuActuel = this.previewResize();
            const debutDeBase = (apercuActuel && apercuActuel.eventId === eventObj.id) ? apercuActuel.startDate : eventObj.startDate;
            const finDeBase = (apercuActuel && apercuActuel.eventId === eventObj.id) ? apercuActuel.endDate : eventObj.endDate;

            let nouveauDebut = new Date(debutDeBase);
            let nouvelleFin = new Date(finDeBase);

            if (estEnDeplacement) 
            {
                let decalage = 0;
                if (event.key === 'ArrowRight') 
                    decalage = 1;

                else if (event.key === 'ArrowLeft') 
                    decalage = -1;

                else if (event.key === 'ArrowDown') 
                    decalage = 7;

                else if (event.key === 'ArrowUp') 
                    decalage = -7;

                nouveauDebut.setDate(nouveauDebut.getDate() + decalage);
                nouvelleFin.setDate(nouvelleFin.getDate() + decalage);
            } 
            else if (estRedimensionnementFin) 
            {
                let decalage = event.key === 'ArrowRight' ? 1 : -1;
                let testFin = new Date(nouvelleFin);
                testFin.setDate(testFin.getDate() + decalage);

                if (testFin.getTime() > nouveauDebut.getTime())
                    nouvelleFin = testFin;
            }
            else if (estRedimensionnementDebut) 
            {
                let decalage = event.key === 'ArrowRight' ? 1 : -1;
                let testDebut = new Date(nouveauDebut);
                testDebut.setDate(testDebut.getDate() + decalage);

                if (testDebut.getTime() < nouvelleFin.getTime())
                    nouveauDebut = testDebut;
            }

            this.previewResize.set({
                eventId: eventObj.id,
                startDate: nouveauDebut,
                endDate: nouvelleFin
            });

            const dateCible = estRedimensionnementDebut ? nouveauDebut : nouvelleFin;
            const nouveauMois = dateCible.getMonth() + 1;
            const nouvelleAnnee = dateCible.getFullYear();
            const moisAChange = (nouveauMois !== this.mois() || nouvelleAnnee !== this.annee());

            if (moisAChange) 
            {
                this.mois.set(nouveauMois);
                this.annee.set(nouvelleAnnee);
            }

            setTimeout(() => 
            {
                const elementEvenement = this.el.nativeElement.querySelector(`#event-${eventObj.id}`) as HTMLElement;
                if (elementEvenement)
                    elementEvenement.focus();

            }, moisAChange ? 120 : 30);
        }
    }

    protected FormatDateAria(date: Date): string 
    {
        if (!date) 
            return '';
        
        // Utilise la langue détectée de ton composant (ou 'fr-FR' par défaut)
        const langue = this.langueNavigateur || 'fr-FR'; 

        // Renvoie par exemple "jeudi 15 mai 2026"
        return date.toLocaleDateString(langue, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
    }

    private AnnulerCreationClavier(): void 
    {
        this.dragCreationEnCours.set(false);
        this.dateDebutCreation.set(null);
        this.dateFinCreation.set(null);
    }

    private DeclencherNavigation(direction: 'left' | 'right'): void 
    {
        if (direction == 'left') 
            this.Precedent();

        else 
            this.Suivant();
    }

    private NettoyerNavigationBulle(): void 
    {
        this.zoneNavigationActive.set(null);
        this.bulleSurvolee.set(null);

        if (this.navigationInterval) 
        {
            clearInterval(this.navigationInterval);
            this.navigationInterval = null;
        }
    }

    private GererNavigationBulle(clientX: number, clientY: number): void 
    {
        const rect = this.el.nativeElement.getBoundingClientRect();
        const MARGE = Math.max(60, rect.width * 0.1);
        
        let zoneActive: 'left' | 'right' | null = null;
        if (clientX < rect.left + MARGE) zoneActive = 'left';
        else if (clientX > rect.right - MARGE) zoneActive = 'right';
        
        this.zoneNavigationActive.set(zoneActive);

        let surLaBulle: 'left' | 'right' | null = null;
        if (zoneActive) 
        {
            const bulleEl = this.el.nativeElement.querySelector(`.nav-edge-indicator.${zoneActive} .nav-bubble`);
            if (bulleEl) 
            {
                const bRect = bulleEl.getBoundingClientRect();
                const padding = 15; 
                
                const estSurLaBulleX = clientX >= bRect.left - padding && clientX <= bRect.right + padding;
                const estSurLaBulleY = clientY >= bRect.top - padding && clientY <= bRect.bottom + padding;

                if (estSurLaBulleX && estSurLaBulleY) surLaBulle = zoneActive;
            }
        }
        
        if (surLaBulle !== this.bulleSurvolee()) 
        {
            if (this.navigationInterval) 
            {
                clearInterval(this.navigationInterval);
                this.navigationInterval = null;
            }

            if (surLaBulle) 
            {
                this.DeclencherNavigation(surLaBulle);

                this.navigationInterval = setInterval(() => {
                    this.DeclencherNavigation(surLaBulle);
                }, 800);
            }
            
            this.bulleSurvolee.set(surLaBulle);
        }
    }

    private Generer(_de: Date, _a: Date): DateCalendrier[] 
    {
        const DATE_DEBUT = new Date(_de.getFullYear(), _de.getMonth(), 1);
        const JOUR_SEMAINE = DATE_DEBUT.getDay();

        let offset: number = JOUR_SEMAINE;

        if (this.mondayFirst()) 
            offset = JOUR_SEMAINE === 0 ? 6 : JOUR_SEMAINE - 1;
        
        DATE_DEBUT.setDate(DATE_DEBUT.getDate() - offset); 

        let liste: DateCalendrier[] = [];

        for (let i = 0; i < 42; i++) 
        {
            let date = new Date(DATE_DEBUT);
            date.setDate(date.getDate() + i);

            if (this.joursAExclure().includes(date.getDay())) 
                continue;

            let listeDateInterval = this.displayEvents().filter(x => this.EstDansIntervalle(date, x.startDate, x.endDate));            
            
            const M = date.getMonth() + 1; // 1 => janvier
            const D = date.getDate();  
            const Y = date.getFullYear();
            
            // --- LOGIQUE DE BLOCAGE DES JOURS ---
            
            // 1. Vérification des dates précises
            let estBloquerDatePrecise = this.daysDisabled()?.some(x => this.EstMemeJour(x, date)) ?? false;

            // 2. Vérification de tes intervalles (récurrents ou ponctuels)
            let estBloquerIntervalle = this.intervalsDisabled().some(inter => {
                const startM = inter.start.month;
                const startD = inter.start.day;
                const startY = inter.start.year;

                const endM = inter.end.month;
                const endD = inter.end.day;
                const endY = inter.end.year;

                // CAS 1 : C'est un événement ponctuel (les deux années sont fournies)
                if (startY != undefined && startY != null && endY !== undefined && endY != null) 
                {
                    const tDate = new Date(Y, M - 1, D).getTime();
                    const tStart = new Date(startY, startM - 1, startD).getTime();
                    const tEnd = new Date(endY, endM - 1, endD).getTime();
                    
                    return tDate >= tStart && tDate <= tEnd;
                }

                // CAS 2 : C'est une période récurrente (ex: été ou hiver)
                const isNormalInterval = (startM < endM) || (startM === endM && startD <= endD);
                let estDansLaPeriode = false;

                if (isNormalInterval)
                    estDansLaPeriode = (M > startM || (M === startM && D >= startD)) && (M < endM || (M === endM && D <= endD));

                else
                    estDansLaPeriode = (M > startM || (M === startM && D >= startD)) || (M < endM || (M === endM && D <= endD));

                if (estDansLaPeriode) 
                {
                    if (startY !== undefined && Y < startY) 
                        return false;

                    if (endY !== undefined && Y > endY) 
                        return false;

                    return true;
                }

                return false;
            });

            let estBloquer = estBloquerDatePrecise || estBloquerIntervalle;
            
            // --- GESTION DES ÉVÉNEMENTS SPÉCIAUX (BADGES) ---
            const eventsSpeciauxDuJour = this.specialEvents().filter(sp => 
            {
                const startM = sp.dateStart.month;
                const startD = sp.dateStart.day;
                const endM = sp.dateEnd.month;
                const endD = sp.dateEnd.day;

                // Gere les intervalles normaux et ceux à cheval sur l'année
                const isNormalInterval = (startM < endM) || (startM === endM && startD <= endD);

                if (isNormalInterval) 
                    return (M > startM || (M === startM && D >= startD)) && (M < endM || (M === endM && D <= endD));

                else 
                    return (M > startM || (M === startM && D >= startD)) || (M < endM || (M === endM && D <= endD));

            });

            liste.push({
                date,
                estBloquer: estBloquer,
                estAujourdhui: this.EstDateJour(date),
                estMoisCourant: date.getMonth() == _de.getMonth(),
                estWeekend: date.getDay() == 0 || date.getDay() == 6,
                listeEvent: listeDateInterval,
                listeEventSpecial: eventsSpeciauxDuJour
            });
        }

        return liste;
    }

    private EstDansIntervalle(_dateAChecker: Date, _debut: Date, _fin: Date): boolean
    {
        const DATE = new Date(_dateAChecker.getFullYear(), _dateAChecker.getMonth(), _dateAChecker.getDate()).getTime();
        const DEBUT = new Date(_debut.getFullYear(), _debut.getMonth(), _debut.getDate()).getTime();
        const FIN = new Date(_fin.getFullYear(), _fin.getMonth(), _fin.getDate()).getTime();

        return DATE >= DEBUT && DATE <= FIN;
    }

    private EstDateJour(_date: Date): boolean
    {
        return this.EstMemeJour(_date, new Date());
    }

    @HostListener('window:resize')
    protected onResize(): void
    {
        this.estPetitEcran.set(window.innerWidth <= 768);
    }
}
